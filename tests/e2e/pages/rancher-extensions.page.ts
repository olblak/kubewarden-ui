import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './basepage';

export class RancherExtensionsPage extends BasePage {
  readonly tabs: Locator

  constructor(page: Page) {
    super(page, 'dashboard/c/local/uiplugins')
    this.tabs = page.getByTestId('extension-tabs')
  }

  async selectTab(name: 'Installed'|'Available'|'Updates'|'All') {
    await this.tabs.getByRole('tab', { name: name, exact:true }).click()
  }

  async enable(addRancherRepo: boolean) {
    await this.page.goto('dashboard/c/local/uiplugins');
    await expect(this.page.getByRole('heading', { name: 'Extension support is not enabled' })).toBeVisible()

    // Enable extensions
    await this.page.getByRole('button', { name: 'Enable' }).click();
    await this.ui.checkbox('Add the Rancher Extension Repository').setChecked(addRancherRepo)
    await this.page.getByRole('button', { name: 'OK' }).click();

    // Wait for extensions to be enabled
    await expect(this.tabs).toBeVisible({timeout: 60_000})
  }

  /**
   * Get extension (plugin) locator from list of extensions
   * @param name Case insensitive exact match of plugin name
   * @returns plugin Locator
   */
  getExtension(name: string) {
    // Filter plugins by name
    const nameRegex = new RegExp(`^\\s+${name}\\s+$`, 'i')
    const plugin = this.page.locator('.plugin')
      .filter({has: this.page.locator('.plugin-name').getByText(nameRegex)})

    // Can't filter by repository in case of duplicit plugins - there is race condition in rancher, does not work as expected yet
    // plugin = plugin.filter({ has: this.page.locator(`xpath=//img[contains(@src, "clusterrepos/${repository}")]`) })
    return plugin
  }

  /**
   * Install rancher extension
   * @param name Exact name of the extension
   * @param version exact version to be installed. Defaults to pre-selected one (latest)
   */
  async install(name: string, options?: {version?: string}) {
    await this.selectTab('Available')

    const plugin = this.getExtension(name)
    await plugin.getByRole('button', { name: 'Install' }).click();

    const dialog = this.page.locator('.plugin-install-dialog')
    if (options?.version) {
      await this.ui.select('Version', options.version)
    }
    await dialog.getByRole('button', { name: 'Install' }).click();
    await expect(plugin.getByRole('button', { name: 'Uninstall' })).toBeEnabled({timeout: 60_000});
  }

  /**
   * Developer load extension
   * @param url can be generated by yarn serve-pkgs command
   */
  async developerLoad(url: string) {
    // Open developer load dialog
    await this.page.getByTestId('extensions-page-menu').click();
    await this.page.getByText('Developer Load').click();
    await expect(this.page.getByRole('heading', { name: 'Developer Load Extension' })).toBeVisible()

    // Load extension
    await this.ui.input('Extension URL').fill(url);
    const moduleName = await this.ui.input('Extension module name').inputValue()
    await this.ui.checkbox('Persist extension').check()
    await this.page.getByRole('button', { name: 'Load', exact:true }).click()

    // Check successful load message
    await expect(this.page.locator('div.growl-message').getByText(`Loaded extension ${moduleName}`, {exact: true})).toBeVisible()
    await this.page.getByTestId('extension-reload-banner-reload-btn').click()
  }

}
