import type Gio from 'gi://Gio';
import type Clutter from 'gi://Clutter';

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

    /** Управляет видимостью подписи "Gоказать больше результатов".
     * 
     * Если true, Shell добавит подпись "Показать больше результатов"
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
     * @param  identifier строковой идентификатор результата.
     * @param  terms поисковые термины. */
    activateResult(identifier: string, terms: string[]): void;

    launchSearch(terms: string[]): void;

    getResultMetas(identifiers: string[], cancellable: Gio.Cancellable): PromiseLike<ResultMetaInterface[]>;

    createResultObject(meta: ResultMetaInterface): Clutter.Actor | null;

    filterResults(identifiers: string[], maxResults: number): string[];

    getSubsearchResultSet(previousIdentifiers: string[], terms: string[], cancellable: Gio.Cancellable): PromiseLike<string[]>;

};