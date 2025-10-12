# Man Search Provider для GNOME Shell

**THIS IS EXAMPLE ONLY**

Поисковый провайдер для быстрого доступа к man-страницам прямо из GNOME Shell overview.

## Как это работает

1. Открываешь overview (Super/Windows клавиша)
2. Начинаешь печатать команду, например `grep`, `bash`, `ls`
3. Видишь результаты из man-страниц
4. Кликаешь на результат → открывается man-страница в терминале

## Установка

```bash
npm install
npm run build-dist
npm run install-ext
```

Затем перезапусти GNOME Shell:
- На Wayland: выйди и войди заново
- На X11: `Alt+F2` → `r` → Enter

Включи расширение в Extensions приложении.

## Использование

Просто начни печатать в overview. Провайдер активируется автоматически для любого запроса.


## Особенности реализации

- Использует `man -k` (apropos) для поиска
- Показывает название команды, секцию и описание
- Открывает man-страницу в gnome-terminal при клике
- Минимальная длина запроса: 2 символа
- Максимум 20 результатов


## Development Workflow


### Main commands:

~~~sh
npm run build   # Compile TypeScript to dist/
npm run install # Install extension to system
npm run debug   # Start nested GNOME Shell (opens terminal with debug output)
npm run dev     # Alias for `npm run build && npm run install && npm run debug`
npm run clear   # Clear dist/ and remove installed extension
~~~


### Typical workflow:

~~~sh
# 1. Changed code
# 2. Build, install and run in nested shell:
npm run build && npm run install && npm run debug

# 3. Shell crashed or closed the window? Restart:
npm run debug

# 4. Rebuild and reinstall:
npm run build && npm run install

# 5. Restart nested shell:
npm run debug

# 6. Clear system:
npm run clear
~~~


### Common mistakes:

When using separate commands, it's easy to:
- Forget to recompile after code changes
- Forget to reinstall after build
- Forget to restart shell after installation

**Solution:** Use `npm run dev` for typical development cycle — it runs all three steps in correct order.


## Nested Shell:

- Opens in a separate window with log and debug output
- Safe for testing (doesn't crash your main desktop)
- Run: `npm run nested-shell:start`
- Stop and run (restart): `npm run nested-shell:restart`
- Stop: `npm run nested-shell:stop` or close the terminal window


## Build and Debug Configuration

Settings in `package.json` section `config`:

~~~json
"config": {
  "ID": "man-search-provider@example.github.com",            // Extension UUID
  "DIST_DIR": "./dist",                                      // Build directory
  "EXTENSION_DIR": "~/.local/share/gnome-shell/extensions",  // Installation path
  "TERMINAL": "gnome-terminal",                              // Terminal for debug logs
  "TERMINAL_PARAM": "--"                                     // Terminal parameter for running commands
}
~~~


### For your extension, change:

- `ID` to your `UUID` (must match with `uuid` in `metadata.json`)
- `TERMINAL` — your terminal program
- `TERMINAL_PARAM` — parameter for running commands (`--`, `-e`, or `-c` depending on your terminal)
