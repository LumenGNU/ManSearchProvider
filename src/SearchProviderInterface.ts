import type Gio from 'gi://Gio';
import type Clutter from 'gi://Clutter';

/** `SearchProviderInterface` — интерфейс, реализующий поставщика поиска для 
 * расширения GNOME Shell 
 * 
 * [Смотри пример реализации поставщика поиска для дополнительной информации]( // @fixme ) */
export interface SearchProviderInterface {


    /** Уникальный строковый идентификатор поставщика поиска в системе. */
    readonly id: string;


    /** `AppInfo` поставщика поиска. */
    readonly appInfo: Gio.AppInfo | null;


    /** Управляет видимостью действия "Показать больше результатов". */
    // @fixme или
    /** Определяет доступность действия "Показать больше результатов". */
    readonly canLaunchSearch: boolean;


    /** Обрабатывает запрос Shell на первоначальный поиск и возвращает 
     * строковые идентификаторы найденных результатов.
     * 
     * **NOTE**: Реализация **должна** прерывать поиск по сигналу объекта 
     * `cancellable`.
     * 
     * @param terms Массив поисковых терминов
     * @param cancellable Объект для отмены операции
     * @returns Promise, который разрешается в массив идентификаторов результатов */
    getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]>;


    /** Обрабатывает запрос Shell на уточнение результатов поиска при добавлении 
     * новых поисковых терминов.
     * 
     * Возвращает подмножество исходного набора результатов или результат нового 
     * поиска.
     * 
     * **NOTE**: Реализация **должна** прерывать поиск по сигналу объекта 
     * `cancellable`.
     * 
     * @param previousIdentifiers Идентификаторы результатов из предыдущего поиска
     * @param terms Массив поисковых терминов
     * @param cancellable Объект для отмены операции
     * @returns Promise, который разрешается в массив идентификаторов результатов */
    getSubsearchResultSet(previousIdentifiers: string[], terms: string[], cancellable: Gio.Cancellable): Promise<string[]>;


    /** Обрабатывает запрос Shell на уменьшения количества отображаемых результатов
     * текущего поиска. 
     * 
     * @param identifiers Полный список идентификаторов текущих результатов
     * @param maxResults Желаемое максимальное количество результатов для отображения
     * @returns Усеченный массив идентификаторов результатов */
    filterResults(identifiers: string[], maxResults: number): string[];


    /** Обрабатывает запрос Shell на получение метаданных результатов для отображения 
     * в UI.
     * 
     * **NOTE**: Реализация **должна** прерывать обработку по сигналу объекта 
     * `cancellable`.
     * 
     * @param identifiers Список идентификаторов
     * @param cancellable Объект для отмены операции
     * @returns Promise, который разрешается в массив метаданных для каждого 
     *   результата из `identifiers` */
    getResultMetas(identifiers: string[], cancellable: Gio.Cancellable): Promise<ResultMetaInterface[]>;


    /** Обрабатывает запрос Shell на получение пользовательского виджет для 
     * отображения результата.
     * 
     * @param meta Метаданные результата
     * @returns Пользовательский виджет или `null` - для стандартного отображения */
    createResultObject(meta: ResultMetaInterface): Clutter.Actor | null;


    /** Обрабатывает запрос Shell на активацию результата поиска.
     *
     * @param identifier Идентификатор активированного результата
     * @param terms Поисковые термины, которые привели к этому результату */
    activateResult(identifier: string, terms: string[]): void;


    /** Обрабатывает запрос Shell на активацию действия "Показать больше результатов".
     * 
     * @param terms Текущие поисковые термины */
    launchSearch(terms: string[]): void;
};


/**
 * Метаданные результата поиска.
 * 
 * Используются Shell для отображения результатов поиска.
 * 
 * [Смотри пример реализации поставщика поиска для дополнительной информации]( // @fixme ) */
export interface ResultMetaInterface {
    /** Уникальный идентификатор результата */
    id: string;

    /** Название для результата */
    name: string;

    /** Описание результата (необязательно). */
    description?: string;

    /** Текст для помещения в буфер обмена (необязательно). */
    clipboardText?: string;

    /** Функция (CallBack), возвращающая значок для результата указанного размера. */
    createIcon: (size: number) => Clutter.Actor;
}