
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";


import { SearchProvider } from './SearchProvider.js';

export default class ExampleExtension extends Extension {

  private declare search_provider: SearchProvider;

  enable() {
    this.search_provider = new SearchProvider(this.uuid);
    Main.overview.searchController.addProvider(this.search_provider);
  }

  disable() {

    Main.overview.searchController.removeProvider(this.search_provider);

    this.search_provider = null as never;
  }

}
