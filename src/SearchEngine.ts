import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// промисификация необходимого api
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
Gio._promisify(Gio.Subprocess.prototype, 'wait_async');

/** Поисковый "движок" */
export class SearchEngine {


    /** Поиск man-страниц по ключевому слову
     * 
     * *NOTE* Shell должен иметь возможность прервать поиск в любой момент
     * 
     * @param terms Массив поисковых терминов
     * @param cancellable Объект для отмены операции
     * @returns Массив идентификаторов в формате `command|section` */
    protected async searchManPages(terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {

        // console.debug('\n' +
        //     `SearchEngine: searchManPages(terms: ${JSON.stringify(terms, null, 2)}), ` +
        //     `cancellable: ${cancellable.constructor.name}`
        // );

        // Ранний выход если операция уже отменена
        if (cancellable.is_cancelled()) return [];

        // Формируем команду `apropos` с поиском по всем терминам переданным в `terms`
        const [success, argv] = GLib.shell_parse_argv(
            `apropos --and ${terms.join(' ')}`
        );

        // Или можно эмулировать бесконечно долгий поиск для понимания в какие моменты
        // Shell будет прерывать поиск
        // const [success, argv] = GLib.shell_parse_argv('sleep infinity');

        if (!success || argv === null) {
            console.error('SearchEngine: searchManPages> Failed to parse command');
            return [];
        };

        console.debug(`SearchEngine: searchManPages> Spawn subprocess: ${argv.join(' ')}`);

        // Запускаем подпроцесс `apropos` с перехватом stdout и stderr
        const apropos = Gio.Subprocess.new(
            argv,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        try {

            // Ожидаем завершения `apropos` с возможностью отмены
            await apropos.wait_async(cancellable);

            // Получаем вывод процесса
            const [stdout, stderr] = await apropos.communicate_utf8_async(null, cancellable);

            // Логируем ошибки `apropos` если есть (для отладки)
            if (stderr || stderr.trim() !== '') {
                console.error(`SearchEngine: searchManPages> Apropos error message: ${stderr}`);
            }

            // Проверяем наличие результата
            if (!stdout?.trim()) return [];

            // Парсим и возвращаем результат
            return this.parseAproposOutput(stdout, cancellable);

        } catch (error) {

            /* Обработка ошибок поиска и прерывания */

            if (error instanceof Gio.IOErrorEnum && error.code === Gio.IOErrorEnum.CANCELLED) {

                // Если Gio.IOErrorEnum.CANCELLED - значит Shell принудительно остановил поиск.
                // Нужно остановить процесс и вернуть пустой результат
                console.debug('SearchEngine: searchManPages> Search cancelled by Shell');

                apropos.force_exit();
                // Принудительно завершаем `apropos`
                // force_exit() безопасна на Unix - можно вызывать многократно без ошибок

                console.debug('SearchEngine: searchManPages> Subprocess force terminated');
            }
            else {
                console.error('SearchEngine: searchManPages> Unexpected error:', error);
            }

            // При любой ошибке возвращаем пустой результат
            return [];
        }
    }

    /** Парсинг вывода команды `apropos`
     * 
     * @param stdout Вывод команды `apropos`
     * @param cancellable Объект для отмены операции
     * @returns Массив строковых идентификаторов в виде `pageName|section` */
    private parseAproposOutput(stdout: string, cancellable: Gio.Cancellable): string[] {

        // подготавливаем идентификаторы
        const identifiers: string[] = [];

        const lines = stdout.split('\n').filter(line => line.trim());

        for (const line of lines) {

            // Проверяем отмену во время обработки
            if (cancellable.is_cancelled()) {
                console.debug('SearchEngine: parseAproposOutput> Parsing cancelled');
                return [];
            }

            // Формируем идентификатор `pageName|section` для каждой не пустой троки
            // Регулярное выражение для формата apropos: page (section) - short description
            const match = line.match(/^([^\s]+)\s*\(([^)]+)\)\s*-\s*(.+)$/);
            if (match) {
                const [, pageName, section] = match;
                identifiers.push(`${pageName.trim()}|${section.trim()}`);
            }
        }

        // Проверяем отмену перед возвратом результата
        if (cancellable.is_cancelled()) {
            console.debug('SearchEngine: parseAproposOutput> Parsing cancelled');
            return [];
        }
        else {
            console.debug(`SearchEngine: parseAproposOutput> Found ${identifiers.length} results`);
            return identifiers;
        }
    }

    /** Получает полное описание
     * 
     * *NOTE* Shell должен иметь возможность прервать поиск в любой момент
     * 
     * Возвращает строку - описание или null
     */
    protected async getDescription(identifier: string, cancellable: Gio.Cancellable): Promise<[name: string, description: string] | null> {

        // console.debug('\n' +
        //     `SearchEngine: getDescription(terms: ${identifier}, ` +
        //     `cancellable: ${cancellable.constructor.name}`
        // );

        // Ранний выход если операция уже отменена
        if (cancellable.is_cancelled()) return null;

        // Получаем из идентификатора pageName и section
        const [pageName, section] = identifier.split('|');

        // Формируем команду для запуска `whatis` 
        const [success, argv] = GLib.shell_parse_argv(
            `whatis -l --section='${section}' '${pageName}'`
        );

        if (!success || argv === null) {
            console.error('SearchEngine: getDescription> Failed to parse command');
            return null;
        };

        console.debug(`SearchEngine: getDescription> Spawn subprocess: ${argv.join(' ')}`);

        // Запускаем подпроцесс `whatis` с перехватом stdout и stderr
        const whatis = Gio.Subprocess.new(
            argv,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        try {

            // Ожидаем завершения `whatis` с возможностью отмены
            await whatis.wait_async(cancellable);

            // Получаем вывод процесса
            const [stdout, stderr] = await whatis.communicate_utf8_async(null, cancellable);

            // Логируем ошибки `whatis` если есть (для отладки)
            if (stderr || stderr.trim() !== '') {
                console.error(`SearchEngine: getDescription> Whatis error message: ${stderr}`);
            }

            // парсим вывод и получаем описание
            const match = stdout.match(/^([^\s]+)\s*\(([^)]+)\)\s*-\s*(.+)/);

            console.debug(`SearchEngine: getDescription> match`, match);

            const description = (match) ? (match[3]?.trim() ?? null) : null;

            // еще раз проверяем
            if (cancellable.is_cancelled()) {
                return null;
            }
            else {
                // формируем результат как [ `pageName (section)`, `description` ]
                return [`${pageName} (${section})`, description ?? 'No description for this page'];
            }

        } catch (error) {

            /* Обработка ошибок поиска и прерывания */

            if (error instanceof Gio.IOErrorEnum && error.code === Gio.IOErrorEnum.CANCELLED) {

                // Если Gio.IOErrorEnum.CANCELLED - значит Shell принудительно остановил создание элементов поиска.
                // Нужно остановить процесс и вернуть null
                console.debug('SearchEngine: getDescription> Process cancelled by Shell');

                whatis.force_exit();
                // Принудительно завершаем `whatis`
                // force_exit() безопасна на Unix - можно вызывать многократно без ошибок

                console.debug('SearchEngine: getDescription> Subprocess force terminated');
            }
            else {
                console.error('SearchEngine: getDescription> Unexpected error:', error);
            }

            // При любой ошибке возвращаем null
            return null;
        }
    }


}