/**
 * @license CC0-1.0
 * The author dedicates this file to the public domain via CC0 1.0 Universal.
 * 
 * To the extent possible under law, the author has waived all copyright
 * and related or neighboring rights to this work.
 * 
 * You can copy, modify, distribute and perform the work, even for commercial
 * purposes, all without asking permission.
 * 
 * Note: This dedication applies to this file as provided. Recipients may
 * incorporate it into projects with different licensing terms.
 * 
 * SPDX-License-Identifier: CC0-1.0
 */

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
