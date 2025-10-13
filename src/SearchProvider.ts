import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { AppSearchProvider } from "resource:///org/gnome/shell/ui/appDisplay.js";

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from "gi://Shell";

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

/**
 * Метаданные результата поиска.
 * 
 * Используется GNOME Shell для отображения результатов поиска.
 * 
 * 
 */
export interface ResultMetaInterface {
    /** Уникальный идентификатор результата */
    id: string;

    /** Название результата */
    name: string;

    /** Описание результата (необязательно) */
    description?: string;

    /** Текст для копирования в буфер обмена (необязательно) */
    clipboardText?: string;

    /** Функция создания иконки для результата */
    createIcon: (size: number) => Clutter.Actor;
}


export interface SearchProviderInterface {

    /** AppInfo поставщика.
     * 
     * Приложение поставщик будет вызвано при вызове "больше результатов" если `canLaunchSearch = true` // @fixme УТОЧНИТЬ/ПРОВЕРИТЬ
     * 
     * Приложения возвращают `Gio.AppInfo`, представляющий их самих.
     * Расширения обычно возвращают `null`.
     * */
    readonly appInfo: Gio.AppInfo | null;

    /** Предлагает ли провайдер подробные результаты.
     * 
     * Если true, Shell добавит кнопку "Показать больше результатов"
     * */
    readonly canLaunchSearch: boolean;

    /** Уникальный идентификатор поставщика в системе.
     * 
     * Расширения обычно возвращают свой UUID.
     *  */
    readonly id: string;

    getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): PromiseLike<string[]>;

    /** Запустить результат поиска.
     * 
     * Этот метод вызывается при активации результата поиска.
     *
     * @param  result идентификатор результата.
     * @param  terms поисковые термины. */
    activateResult(result: string, terms: string[]): void;

    launchSearch(terms: string[]): void;

    getResultMetas(results: string[], cancellable: Gio.Cancellable): PromiseLike<ResultMetaInterface[]>;

    createResultObject(meta: ResultMetaInterface): Clutter.Actor | null;

    filterResults(results: string[], maxResults: number): string[];

    getSubsearchResultSet(previousResults: string[], terms: string[], cancellable: Gio.Cancellable): PromiseLike<string[]>;

};

export class SearchProvider implements SearchProviderInterface {

    private extension;

    constructor(extension: Extension) {
        this.extension = extension;
    }

    /** AppInfo поставщика */
    get appInfo(): Gio.AppInfo | null {

        // Можно вернуть фейковый AppInfo для кнопки "Показать больше результатов"

        // Если вернуть null поставщиком будет GNOME Shell, а результаты будут
        // отображены как значки (не список) вне какой либо группы
        // return null;

        // В этом примере поиск будет проводится "от лица" `gnome-terminal`
        // что значит что результаты будут сгруппированы в блок со значком терминала
        // и заголовком "Terminal" (с учетом локали)
        const app = Shell.AppSystem.get_default().lookup_app("org.gnome.Terminal.desktop");
        return app.appInfo;
    }

    /** Предлагает ли провайдер подробные результаты. */
    get canLaunchSearch(): boolean {
        return true; // Включаем кнопку "Показать все"
    }

    /** Уникальный идентификатор поставщика в системе. */
    get id(): string {
        return this.extension.uuid;
    }

    /** Инициировать новый поиск.
     * 
     * Этот метод вызывается для запуска нового поиска и должен возвращать список
     * уникальных идентификаторов результатов.
     * 
     * Если срабатывает cancellable, этот метод **должен** выдать результат и остановить поиск.
     * 
     * @async
     * @param terms поисковые термины
     * @param cancellable отменяемое действие для операции
     * @returns список идентификаторов результатов */
    async getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {

        // console.debug(`\nmp-search-provider: getInitialResultSet(terms: ${JSON.stringify(terms, null, 2)}), cancellable: ${cancellable.constructor.name}`);

        // документация говорит что промис нужно отклонять при срабатывании прерывателя, но, 
        // по видимому, шел не обрабатывает такую ситуацию  https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/search.js?ref_type=heads#L702
        // Во всех исключительных ситуациях будем возвращать пустой массив результатов


        // Проверяем, не отменён ли запрос до начала
        if (cancellable.is_cancelled()) {
            return [];
        }

        const query = terms.join(' ');

        try {

            if (query.length < 2) {
                return ([]);
            }

            if (cancellable.is_cancelled()) {
                return ([]);
            }

            console.debug(`mp-search-provider: getInitialResultSet> start 'searchManPages' ...`);

            const results = await this.searchManPages(query, cancellable);

            console.debug(`mp-search-provider: getInitialResultSet> found '${results.length}' results`);

            return (results);

        }
        catch (error) {

            if (error instanceof GLib.Error && error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)) {
                console.debug('mp-search-provider: getInitialResultSet> Error in getInitialResultSet: Search was cancelled');
            }
            else if (error instanceof Error) {
                console.error('mp-search-provider: getInitialResultSet> Error in getInitialResultSet:', error.message);
            }
            else {
                console.error('mp-search-provider: getInitialResultSet> Error in getInitialResultSet: Unknown Error');
            }

            return ([]); // Возвращаем пустой массив вместо reject
        }

    }

    /** Запустить результат поиска.
     * 
     * Этот метод вызывается при активации результата поиска.
     *
     * @param  result идентификатор результата. (то, что отображается как активированная строка-результат)
     * @param  terms поисковые термины. (то, что сейчас в строке поиска) */
    activateResult(result: string, terms: string[]) {

        // console.debug(`\nmp-search-provider: activateResult(result: ${result}, terms: ${JSON.stringify(terms, null, 2)})`);

        const [name, section, description] = result.split('|');

        // Открываем man-страницу в терминале
        try {
            console.debug(`mp-search-provider: activateResult> spawn gnome-terminal for show man '${name}' ...`);
            // Используем gnome-terminal для отображения выбранного результата
            GLib.spawn_command_line_async(`gnome-terminal -- man ${section} ${name}`);

        } catch (e) {
            console.error('Error activating result:', e);
        }
    }

    /** Запуск поискового провайдера.
     * 
     * Показывает все найденные man-страницы в терминале
     *
     * @param terms - поисковые термины */
    launchSearch(terms: string[]): void {

        console.debug(`\nmp-search-provider: launchSearch(terms: ${JSON.stringify(terms, null, 2)}])`);

        // этот метод не обязан что либо делать

        const query = terms.join(' ');

        // в этом примере используется "запуск как команду", но лучше использовать что то более
        // надежное и безопасное - как активацию по dbus например
        try {

            console.debug('\nmp-search-provider: launchSearch> spawn gnome-terminal for show more results for terms ...');
            // Открываем терминал с apropos (то же что man -k)
            GLib.spawn_command_line_async(`gnome-terminal -- bash -c "apropos ${GLib.shell_quote(query)}; read -p '\n\nPress Enter to close...'"`);
        } catch (e) {
            console.error('Error launching search:', e);
        }
    }

    /** Создать объект результата.
     * 
     * Этот метод вызывается для создания актора, представляющего результат поиска.
     *
     * @param meta объект метаданных результата
     * @returns Актер для результата */
    createResultObject(meta: ResultMetaInterface): Clutter.Actor | null {

        // console.debug(`\nmp-search-provider: createResultObject(meta: ${JSON.stringify(meta, null, 2)})`);

        return null;

    }


    /** Получить метаданные результата.
     *
     * Этот метод вызывается для получения `ResultMeta` для каждого идентификатора.
     *
     * Если срабатывает `cancellable`, этот метод **должен** выдать ошибку.
     *
     * @async
     * @param results идентификаторы результатов
     * @param cancellable отменяемое действие для операции
     * @returns массив объектов метаданных результата */
    getResultMetas(results: string[], cancellable: Gio.Cancellable): Promise<ResultMetaInterface[]> {

        // console.debug(`\nmp-search-provider: getResultMetas(results: ${JSON.stringify(results, null, 2)}, cancellable: ${cancellable.constructor.name})`);


        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);

        return new Promise((resolve, reject) => {
            const cancelledId = cancellable.connect(
                () => reject(Error('Operation Cancelled')));

            const resultMetas = [] as ResultMetaInterface[];

            for (const result of results) {

                const [name, section, description] = result.split('|');

                // Создаем и заполняем объект `ResultMeta` для каждого результата
                const meta: ResultMetaInterface = {
                    id: `${name}|${section}`,
                    name: `${name} (${section})`,
                    description: description || 'Man page',

                    // Иконку можно заимствовать у терминала
                    // createIcon: (size) => Shell.AppSystem.get_default().lookup_app('org.gnome.Terminal.desktop').create_icon_texture(size),
                    // или,
                    // если указываем кастомную иконку нужно учесть scaleFactor для ее размера
                    createIcon: (size) => {
                        return new St.Icon({
                            icon_name: 'system-help',
                            width: size * scaleFactor,
                            height: size * scaleFactor,
                        });
                    },
                };

                resultMetas.push(meta);
            }

            cancellable.disconnect(cancelledId);

            if (!cancellable.is_cancelled()) {
                resolve(resultMetas);
            }
        });
    }



    /** Уточнить текущий поиск.
     * 
     * Этот метод вызывается для уточнения текущих результатов поиска с помощью
     * расширенных терминов и должен возвращать подмножество исходного набора результатов.
     * 
     * Реализации могут использовать этот метод для более эффективного уточнения результатов поиска,
     * чем запуск нового поиска, или просто передавать термины в
     * реализацию `getInitialResultSet()`.
     * 
     * Если срабатывает cancellable, этот метод должен вызывать ошибку.
     * 
     * @async
     * @param results исходный набор результатов
     * @param terms поисковые термины
     * @param cancellable — отменяемое действие для операции
     * @returns подмножество исходного набора результатов */
    getSubsearchResultSet(previousResults: string[], terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {

        // console.debug(`\nmp-search-provider: getSubsearchResultSet(results: ${JSON.stringify(previousResults, null, 2)}, ${JSON.stringify(terms, null, 2)}), cancellable: ${cancellable.constructor.name}`);

        if (cancellable.is_cancelled())
            throw Error('Search Cancelled');

        // Просто запускаем новый поиск с обновленными терминами
        return this.getInitialResultSet(terms, cancellable);
    }

    /** Фильтрация текущего поиска.
     *
     * Этот метод вызывается для сокращения количества результатов поиска.
     *
     * Реализации могут использовать свои собственные критерии для отбрасывания результатов или
     * просто возвращать первые n элементов.
     *
     * @param results исходный набор результатов
     * @param maxResults желаемое максимальное количество результатов
     * @returns отфильтрованные результаты */
    filterResults(results: string[], maxResults: number): string[] {

        // console.debug(`\nmp-search-provider: filterResults(results: ${JSON.stringify(results, null, 2)}, maxResults: ${maxResults})`);

        // Игнорируем ограничение Shell и показываем больше результатов
        // Shell может показать до ~15 результатов в списке
        const ourMax = 15;

        if (results.length <= ourMax)
            return results;

        return results.slice(0, ourMax/*maxResults*/);
    }

    // -----
    // Реализация поиска

    /** Поиск man-страниц по ключевому слову */
    private async searchManPages(query: string, cancellable: Gio.Cancellable): Promise<string[]> {
        // try {
        // Проверяем, не отменён ли запрос до начала
        if (cancellable.is_cancelled()) {
            return [];
        }

        // Используем асинхронный spawn для возможности отмены
        const proc = new Gio.Subprocess({
            argv: ['man', '-k', query],
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
        });
        proc.init(cancellable);

        // Асинхронно читаем stdout с поддержкой cancellable
        const [stdout] = await proc.communicate_utf8_async(null, cancellable);

        if (!stdout || stdout.trim() === '') {
            return [];
        }

        const results = [] as string[];
        const lines = stdout.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            // Проверяем отмену во время обработки
            if (cancellable.is_cancelled()) {
                return [];
            }

            // Формат: command (section) - description
            const match = line.match(/^([^\s]+)\s*\(([^)]+)\)\s*-\s*(.+)$/);
            if (match) {
                results.push(`${match[1].trim()}|${match[2].trim()}|${match[3].trim()}`);
            }
        }

        return results.slice(0, 20);

        // } catch (e) {
        //     // GLib.Error с кодом Gio.IOErrorEnum.CANCELLED при отмене
        //     if (e instanceof GLib.Error && e.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)) {
        //         console.log('Search was cancelled');
        //         return [];
        //     }
        //     console.error('Error searching man pages:', e);
        //     return [];
        // }
    }
}