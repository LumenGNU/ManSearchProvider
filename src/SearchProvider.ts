import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { AppSearchProvider } from "resource:///org/gnome/shell/ui/appDisplay.js";

import * as Search from 'resource:///org/gnome/shell/ui/search.js';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from "gi://Shell";

import {
    ResultMetaInterface,
    SearchProviderInterface
} from './SearchProviderInterface.js';

import {
    SearchEngine
} from './SearchEngine.js';



export class SearchProvider extends SearchEngine implements SearchProviderInterface {

    private extensionId;

    constructor(extensionId: string) {
        super();

        this.extensionId = extensionId;
    }

    /** Уникальный идентификатор поставщика в системе. */
    get id(): string {
        return this.extensionId;
    }

    /** Управляет видимостью подписи "Показать больше результатов". */
    get canLaunchSearch(): boolean {
        // Будет отображаться всегда если `filterResults`
        // отбросил часть результатов
        return true;
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


    /** Инициирует новый поиск.
     * 
     * Этот метод вызывается для запуска нового поиска и должен возвращать список
     * уникальных идентификаторов результатов.
     * 
     * Если срабатывает cancellable, этот метод **должен** выдать результат и остановить поиск.
     * 
     * @param terms поисковые термины
     * @param cancellable отменяемое действие для операции
     * @returns список идентификаторов результатов */
    async getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {

        console.debug(`\nSearchProvider: getInitialResultSet(terms: ${JSON.stringify(terms, null, 2)}), cancellable: ${cancellable.constructor.name}`);

        // документация говорит что промис нужно отклонять при срабатывании прерывателя, но, 
        // по видимому, шел не обрабатывает такую ситуацию  https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/search.js?ref_type=heads#L702
        // Во всех исключительных ситуациях будем возвращать пустой массив результатов


        // Проверяем, не отменён ли запрос до начала
        if (cancellable.is_cancelled()) return [];


        // Должен быть хотя бы один термин и хотя бы 2 символа
        if ((terms[0]?.length ?? 0) < 2) return [];

        console.debug(`SearchProvider: getInitialResultSet> start 'searchManPages' ...`);

        /** запускаем наш поиск {@link searchManPages} */
        const resultIdentifiers = await this.searchManPages(terms, cancellable);

        console.debug(`SearchProvider: getInitialResultSet> found '${resultIdentifiers.length}' results`);

        // возвращаем список результатов
        // этот массив будет передаваться в другие методы как `identifiers`
        return (resultIdentifiers);

    }

    // -----



    /** Создать объект результата.
     * 
     * Этот метод вызывается для создания актора, представляющего результат поиска.
     *
     * @param resultMeta объект метаданных результата
     * @returns Актер для результата, или null -  */
    createResultObject(_resultMeta: ResultMetaInterface): Clutter.Actor | null {
        // console.debug(`SearchProvider: createResultObject(meta: ${JSON.stringify(resultMeta, null, 2)})`);
        // return new St.Icon({ icon_name: 'dialog-information-symbolic' });
        return null;
    }


    /** Получить метаданные результата.
     *
     * Этот метод вызывается для получения `ResultMeta` для каждого идентификатора.
     *
     * Если срабатывает `cancellable`, этот метод **должен** прервать работу и вернуть пустой результат.
     * Шелл не обрабатывает отклоненный промис https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/search.js?ref_type=heads#L230
     *
     * @async
     * @param results идентификаторы результатов
     * @param cancellable отменяемое действие для операции
     * @returns массив объектов метаданных результата */
    async getResultMetas(identifiers: any[], cancellable: Gio.Cancellable): Promise<ResultMetaInterface[]> {

        // console.debug(`\nSearchProvider: getResultMetas(results: ${JSON.stringify(results, null, 2)}, cancellable: ${cancellable.constructor.name})`);

        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);

        // Проверяем, не отменён ли запрос до начала
        if (cancellable.is_cancelled()) {
            return [];
        }

        const resultMetas = [] as ResultMetaInterface[];

        for (const identifier of identifiers) {

            if (cancellable.is_cancelled()) return [];

            /** {@link getDescription} */
            const result = await this.getDescription(identifier, cancellable);

            // если результат null - или процесс прерван или
            // случилась ошибка - в любои случае нет смысла продолжать
            if (!result) return [];

            const [name, description] = result;

            // Создаем и заполняем объект `ResultMeta` для каждого результата
            const meta: ResultMetaInterface = {
                id: identifier,
                name: name,
                description: description,

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

        if (cancellable.is_cancelled()) {
            return [];
        }
        else {
            return (resultMetas);
        }
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
    async getSubsearchResultSet(_previousResults: string[], terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {

        // console.debug(`\nSearchProvider: getSubsearchResultSet(results: ${JSON.stringify(_previousResults, null, 2)}, ${JSON.stringify(terms, null, 2)}), cancellable: ${cancellable.constructor.name}`);

        if (cancellable.is_cancelled()) return [];

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
     * @param identifiers исходный набор результатов
     * @param _maxResults желаемое максимальное количество результатов
     * @returns отфильтрованные результаты */
    filterResults(identifiers: string[], _maxResults: number): string[] {

        // console.debug(`\nSearchProvider: filterResults(results: ${results.length}, maxResults: ${_maxResults})`);

        // Игнорируем ограничение Shell и показываем больше результатов
        const ourMax = 7; // 12

        if (identifiers.length <= ourMax) return identifiers;

        return identifiers.slice(0, ourMax);
    }


    /** Этот метод вызывается при активации результата поиска.
     * 
     * Если `ResultMeta` результата предоставляет `clipboardText` соответствующий текст будет помещен
     * в буфер обмена.
     * 
     * https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/search.js?ref_type=heads#L61
     *
     * @param  result идентификатор результата. (то, что отображается как активированная строка-результат)
     * @param  terms поисковые термины. (то, что сейчас в строке поиска) */
    activateResult(result: string, _terms: string[]) {

        // console.debug(`\nSearchProvider: activateResult(result: ${result}, terms: ${JSON.stringify(terms, null, 2)})`);

        const [name, section, _description] = result.split('|');

        // Открываем man-страницу в терминале
        // Используем gnome-terminal для отображения выбранного результата
        // **gnome-terminal не сможет стартовать внутри nested shell**
        try {
            console.debug(`SearchProvider: activateResult> spawn gnome-terminal for 'man ${section} ${name}' ...`);

            const [success, argv] = GLib.shell_parse_argv(`gnome-terminal -- man ${section} ${name}`);
            if (success && argv) {
                Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            }

        } catch (error) {
            console.error('SearchProvider: activateResult> Error activating result:', error);
        }
    }


    /** Запуск поискового провайдера.
     * 
     * Показывает все найденные man-страницы в терминале
     *
     * @param terms - поисковые термины */
    launchSearch(terms: string[]): void {

        // console.debug(`\nSearchProvider: launchSearch(terms: ${JSON.stringify(terms, null, 2)}])`);

        // этот метод не обязан что либо делать

        // в этом примере используется субпроцесс, но лучше использовать что то более
        // надежное и безопасное - как активацию по dbus например
        // **gnome-terminal не сможет стартовать внутри nested shell**
        try {
            console.debug('SearchProvider: launchSearch> spawn gnome-terminal for show more results for terms ...');

            // Открываем терминал с apropos (то же что man -k)
            const [success, argv] = GLib.shell_parse_argv(`gnome-terminal -- bash -c "apropos ${terms.join(' ')}; read -p '\n\nPress Enter to close...'"`);
            if (success && argv) {
                Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            }

        } catch (error) {
            console.error('SearchProvider: launchSearch> Error launching search:', error);
        }
    }
}