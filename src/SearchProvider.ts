import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

/**
 * Метаданные результата поиска.
 * 
 * Используется GNOME Shell для отображения результатов поиска.
 * 
 * @see https://gjs.guide/extensions/topics/search-provider.html
 */
export interface ResultMeta {
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

export class SearchProvider {

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
        return null;
    }

    /** Предлагает ли провайдер подробные результаты.
     * 
     * Приложения возвращают значение `true`, если у них есть возможность отображать более
     * подробные или полные результаты. Расширения обычно возвращают значение `false`.
     * */
    get canLaunchSearch(): boolean {
        return false;
    }

    /** Уникальный идентификатор поставщика.
     * 
     * Приложения возвращают свой идентификатор приложения. Расширения обычно
     * возвращают свой UUID.
     *  */
    get id(): string {
        return this.extension.uuid;
    }

    /** Запустить результат поиска.
     * Этот метод вызывается при активации результата поисковой системы.
     *
     * @param  идентификатор результата
     * @param  поисковые термины
     */
    activateResult(result: string, terms: string[]) {
        console.debug(`activateResult(${result}, [${terms}])`);
    }

    /** Запуск поискового провайдера.
     * 
     * Этот метод вызывается при активации поискового провайдера. Провайдер может быть
     * активирован только в том случае, если свойство `appInfo` содержит действительное значение `Gio.AppInfo`,
     * а свойство `canLaunchSearch` имеет значение `true`.
     * 
     * Приложения обычно открывают окно для отображения более подробных или
     * полных результатов.
     *
     * @param terms - поисковые термины */
    launchSearch(terms: string[]) {
        console.debug(`launchSearch([${terms}])`);
    }

    /** Создать объект результата.
     * 
     * Этот метод вызывается для создания актора, представляющего результат поиска.
     * Реализации могут возвращать любой `Clutter.Actor`, который будет служить результатом отображения,
     * или `null` для реализации по умолчанию.
     *
     * @param meta объект метаданных результата
     * @returns Актер для результата */
    createResultObject(meta: ResultMeta): Clutter.Actor | null {
        console.debug(`createResultObject(${meta.id})`);

        return null;
    }

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
    getResultMetas(results: string[], cancellable: Gio.Cancellable): Promise<ResultMeta[]> {
        console.debug(`getResultMetas([${results}])`);

        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);

        return new Promise((resolve, reject) => {
            const cancelledId = cancellable.connect(
                () => reject(Error('Operation Cancelled')));

            const resultMetas = [] as ResultMeta[];

            for (const identifier of results) {
                const meta: ResultMeta = {
                    id: identifier,
                    name: 'Result Name',
                    description: 'The result description',
                    clipboardText: 'Content for the clipboard',
                    createIcon: size => {
                        return new St.Icon({
                            icon_name: 'dialog-information',
                            width: size * scaleFactor,
                            height: size * scaleFactor,
                        });
                    },
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
        console.debug(`getInitialResultSet([${terms}])`);

        return new Promise((resolve, reject) => {
            const cancelledId = cancellable.connect(
                () => reject(Error('Search Cancelled')));

            const identifiers = [
                'result-01',
                'result-02',
                'result-03',
            ];

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
        console.debug(`getSubsearchResultSet([${results}], [${terms}])`);

        if (cancellable.is_cancelled())
            throw Error('Search Cancelled');

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
     * @param maxResults максимальное количество результатов
     * @returns отфильтрованные результаты */
    filterResults(results: string[], maxResults: number): string[] {
        console.debug(`filterResults([${results}], ${maxResults})`);

        if (results.length <= maxResults)
            return results;

        return results.slice(0, maxResults);
    }
}
