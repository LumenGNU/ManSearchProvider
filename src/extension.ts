
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { SearchProvider } from './SearchProvider.js';

export default class ExampleExtension extends Extension {

    private declare searchProvider: SearchProvider;

    enable() {
        // Создание и регистрация поставщика
        this.searchProvider = new SearchProvider(this.uuid);
        Main.overview.searchController.addProvider(this.searchProvider);
    }

    disable() {
        // Отмена регистрации поставщика
        Main.overview.searchController.removeProvider(this.searchProvider);
        this.searchProvider = null as never;
    }

}
