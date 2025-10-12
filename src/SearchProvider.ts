import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { AppSearchProvider } from "resource:///org/gnome/shell/ui/appDisplay.js";

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from "gi://Shell";

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

interface ManPage {
    name: string;
    section: string;
    description: string;
}

export interface SearchProviderInterface {

    readonly appInfo: Gio.AppInfo | null;

    readonly canLaunchSearch: boolean;

    readonly id: string;

    activateResult(result: string, terms: string[]): void;

    launchSearch(terms: string[]): void;

    getResultMetas(results: string[], cancellable: Gio.Cancellable): Promise<ResultMetaInterface[]>;

    createResultObject(meta: ResultMetaInterface): Clutter.Actor | null;

};

export class SearchProvider /*implements AppSearchProvider*/ {

    private extension;

    constructor(extension: Extension) {
        this.extension = extension;
    }

    /** Приложение поставщика.
     * 
     * Приложения возвращают `Gio.AppInfo`, представляющий их самих.
     * Расширения обычно возвращают `null`.
     * */
    get appInfo(): Gio.AppInfo | null {
        // Можно вернуть фейковый AppInfo для кнопки "Показать все"
        // return null;

        const app = Shell.AppSystem.get_default().lookup_app("org.gnome.Terminal.desktop");
        return app.appInfo;
    }

    /** Предлагает ли провайдер подробные результаты.
     * 
     * Если true, Shell добавит кнопку "Показать все результаты"
     * */
    get canLaunchSearch(): boolean {
        return false; // Включаем кнопку "Показать все"
    }

    /** Уникальный идентификатор поставщика.
     * 
     * Приложения возвращают свой идентификатор приложения. Расширения обычно
     * возвращают свой UUID.
     *  */
    get id(): string {
        return this.extension.uuid;
    }

    /**
     * Поиск man-страниц по ключевому слову
     */
    private searchManPages(query: string): ManPage[] {
        try {
            // Используем man -k (apropos) для поиска
            const [ok, stdout, stderr] = GLib.spawn_command_line_sync(`man -k ${GLib.shell_quote(query)}`);

            if (!ok) {
                console.error('Failed to execute man -k');
                return [];
            }

            const decoder = new TextDecoder('utf-8');
            const output = decoder.decode(stdout!);

            if (!output || output.trim() === '') {
                return [];
            }

            const results: ManPage[] = [];
            const lines = output.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                // Формат: command (section) - description
                const match = line.match(/^([^\s]+)\s*\(([^)]+)\)\s*-\s*(.+)$/);
                if (match) {
                    results.push({
                        name: match[1],
                        section: match[2],
                        description: match[3].trim()
                    });
                }
            }

            return results.slice(0, 20); // Ограничиваем 20 результатами
        } catch (e) {
            console.error('Error searching man pages:', e);
            return [];
        }
    }

    /** Запустить результат поиска.
     * Этот метод вызывается при активации результата поисковой системы.
     *
     * @param  result идентификатор результата. (то что отображается как строка-результат)
     * @param  поисковые термины
     */
    activateResult(result: string, terms: string[]) {

        console.debug(`\nmp-search-provider: activateResult(result: ${result}, terms: ${JSON.stringify(terms, null, 2)})`);

        // Открываем man-страницу в терминале
        try {
            // result имеет формат "name(section)"
            const [name_section, ..._description] = result.split('|');
            const [name, section] = name_section.replace(')', '').split('(');

            // Можно использовать gnome-terminal или yelp
            // Вариант 1: Терминал
            GLib.spawn_command_line_async(`gnome-terminal -- man ${section} ${name}`);


            // Вариант 2: GUI просмотрщик (раскомментируйте если хотите)
            // GLib.spawn_command_line_async(`yelp man:${name}(${section})`);
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

        const query = terms.join(' ');

        try {
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

        console.debug(`\nmp-search-provider: createResultObject(meta: ${JSON.stringify(meta, null, 2)})`);

        return null;

        // // Создаем кастомный виджет для отображения в виде списка
        // const box = new St.BoxLayout({
        //     style_class: 'list-search-result-content',
        //     vertical: false,
        //     x_expand: true,
        //     y_expand: true
        // });

        // // Добавляем иконку
        // const icon = meta.createIcon(this.ICON_SIZE || 32);
        // box.add_child(icon);

        // // Создаем текстовый блок
        // const textBox = new St.BoxLayout({
        //     style_class: 'list-search-result-text',
        //     vertical: true,
        //     x_expand: true,
        //     y_align: Clutter.ActorAlign.CENTER
        // });

        // // Название
        // const name = new St.Label({
        //     text: meta.name,
        //     style_class: 'list-search-result-title'
        // });
        // textBox.add_child(name);

        // // Описание (если есть)
        // if (meta.description) {
        //     const description = new St.Label({
        //         text: meta.description,
        //         style_class: 'list-search-result-description'
        //     });
        //     textBox.add_child(description);
        // }

        // box.add_child(textBox);

        // return box;
    }

    private ICON_SIZE = 32;

    /** Получить метаданные результата.
     *
     * Этот метод вызывается для получения `ResultMeta` для каждого идентификатора.
     *
     * Если срабатывает cancellable, этот метод должен выдать ошибку.
     *
     * @async
     * @param results идентификаторы результатов
     * @param cancellable отменяемое действие для операции
     * @returns массив объектов метаданных результата */
    getResultMetas(results: string[], cancellable: Gio.Cancellable): Promise<ResultMetaInterface[]> {

        console.debug(`\nmp-search-provider: getResultMetas(results: ${JSON.stringify(results, null, 2)}, cancellable: ${cancellable.constructor.name})`);

        // const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);

        return new Promise((resolve, reject) => {
            const cancelledId = cancellable.connect(
                () => reject(Error('Operation Cancelled')));

            const resultMetas = [] as ResultMetaInterface[];

            for (const identifier of results) {
                // identifier имеет формат "name(section)"
                const [fullName, desc] = identifier.split('|');
                const [name, section] = fullName.replace(')', '').split('(');

                const meta: ResultMetaInterface = {
                    id: identifier,
                    name: `${name} (${section})`,
                    description: desc || 'Man page',
                    createIcon: (size: number) => Shell.AppSystem.get_default().lookup_app('org.gnome.Terminal.desktop').create_icon_texture(size),
                };

                resultMetas.push(meta);
            }

            cancellable.disconnect(cancelledId);
            if (!cancellable.is_cancelled())
                resolve(resultMetas);
        });
    }

    /** Инициировать новый поиск.
     * 
     * Этот метод вызывается для запуска нового поиска и должен возвращать список
     * уникальных идентификаторов результатов.
     * 
     * Если срабатывает cancellable, этот метод должен выдать ошибку.
     * 
     * @async
     * @param terms поисковые термины
     * @param cancellable отменяемое действие для операции
     * @returns список идентификаторов результатов */
    getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {

        console.debug(`\nmp-search-provider: getInitialResultSet(terms: ${JSON.stringify(terms, null, 2)}), cancellable: ${cancellable.constructor.name}`);

        return new Promise((resolve, reject) => {
            const cancelledId = cancellable.connect(
                () => reject(Error('Search Cancelled')));

            // Объединяем поисковые термины в один запрос
            const query = terms.join(' ');

            // Минимум 2 символа для поиска
            if (query.length < 2) {
                cancellable.disconnect(cancelledId);
                resolve([]);
                return;
            }

            const manPages = this.searchManPages(query);

            // Формируем идентификаторы: "name(section)|description"
            const identifiers = manPages.map(page =>
                `${page.name}(${page.section})|${page.description}`
            );

            cancellable.disconnect(cancelledId);
            if (!cancellable.is_cancelled())
                resolve(identifiers);
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
    getSubsearchResultSet(results: string[], terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {

        console.debug(`\nmp-search-provider: getSubsearchResultSet(results: ${JSON.stringify(results, null, 2)}, ${JSON.stringify(terms, null, 2)}), cancellable: ${cancellable.constructor.name}`);

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

        console.debug(`\nmp-search-provider: filterResults(results: ${JSON.stringify(results, null, 2)}, maxResults: ${maxResults})`);

        // Игнорируем ограничение Shell и показываем больше результатов
        // Shell может показать до ~15 результатов в списке
        const ourMax = 15;

        if (results.length <= ourMax)
            return results;

        return results.slice(0, ourMax);
    }
}