import re

# 1. billing.handlers.ts
with open('electron/ipc/billing.handlers.ts', 'r') as f:
    billing = f.read()
billing = billing.replace("import { validateNonEmptyString, validatePositiveInteger } from './validation';", "import { validateNonEmptyString, validatePositiveInteger } from './validation';\nimport { DatabaseLock } from './DatabaseLock';")
billing = billing.replace("const handleRequest = async (action: () => void): Promise<IpcResponse<ActiveBillDTO>> => {\n    try {\n      action();", "const handleRequest = async (action: () => void): Promise<IpcResponse<ActiveBillDTO>> => {\n    try {\n      DatabaseLock.check();\n      action();")
billing = billing.replace("ipcMain.handle('billing:finalize', async (): Promise<IpcResponse<FinalizedBillDTO>> => {\n    try {\n      const result = billingService.finalizeBill();", "ipcMain.handle('billing:finalize', async (): Promise<IpcResponse<FinalizedBillDTO>> => {\n    try {\n      DatabaseLock.check();\n      const result = billingService.finalizeBill();")
with open('electron/ipc/billing.handlers.ts', 'w') as f:
    f.write(billing)

# 2. products.handlers.ts
with open('electron/ipc/products.handlers.ts', 'r') as f:
    products = f.read()
products = products.replace("import { validateString, validateNumber, validateBoolean } from './validation';", "import { validateString, validateNumber, validateBoolean } from './validation';\nimport { DatabaseLock } from './DatabaseLock';")
products = products.replace("ipcMain.handle('products:create', async (_, name: string, priceMinor: number, barcode?: string | null): Promise<IpcResponse<ProductDTO>> => {\n    try {\n      validateString(name, 'name');", "ipcMain.handle('products:create', async (_, name: string, priceMinor: number, barcode?: string | null): Promise<IpcResponse<ProductDTO>> => {\n    try {\n      DatabaseLock.check();\n      validateString(name, 'name');")
products = products.replace("ipcMain.handle('products:update', async (_, id: string, name?: string, priceMinor?: number, barcode?: string | null): Promise<IpcResponse<ProductDTO>> => {\n    try {\n      validateString(id, 'id');", "ipcMain.handle('products:update', async (_, id: string, name?: string, priceMinor?: number, barcode?: string | null): Promise<IpcResponse<ProductDTO>> => {\n    try {\n      DatabaseLock.check();\n      validateString(id, 'id');")
products = products.replace("ipcMain.handle('products:setActive', async (_, id: string, isActive: boolean): Promise<IpcResponse<void>> => {\n    try {\n      validateString(id, 'id');", "ipcMain.handle('products:setActive', async (_, id: string, isActive: boolean): Promise<IpcResponse<void>> => {\n    try {\n      DatabaseLock.check();\n      validateString(id, 'id');")
products = products.replace("ipcMain.handle('products:deleteAll', async (): Promise<IpcResponse<void>> => {\n    try {\n      productService.deleteAllProducts();", "ipcMain.handle('products:deleteAll', async (): Promise<IpcResponse<void>> => {\n    try {\n      DatabaseLock.check();\n      productService.deleteAllProducts();")
with open('electron/ipc/products.handlers.ts', 'w') as f:
    f.write(products)

# 3. settings.handlers.ts
with open('electron/ipc/settings.handlers.ts', 'r') as f:
    settings = f.read()
settings = settings.replace("import { validateObject, validateBoolean, validateString, validatePositiveInteger, validateNumber } from './validation';", "import { validateObject, validateBoolean, validateString, validatePositiveInteger, validateNumber } from './validation';\nimport { DatabaseLock } from './DatabaseLock';")
settings = settings.replace("ipcMain.handle('settings:update', async (_, settings: AppSettingsDTO): Promise<IpcResponse<AppSettingsDTO>> => {\n    try {\n      validateAppSettings(settings);", "ipcMain.handle('settings:update', async (_, settings: AppSettingsDTO): Promise<IpcResponse<AppSettingsDTO>> => {\n    try {\n      DatabaseLock.check();\n      validateAppSettings(settings);")
with open('electron/ipc/settings.handlers.ts', 'w') as f:
    f.write(settings)

# 4. restore.handlers.ts
with open('electron/ipc/restore.handlers.ts', 'r') as f:
    restore = f.read()
restore = restore.replace("import { ipcMain, app } from 'electron';", "import { ipcMain, app } from 'electron';\nimport { DatabaseLock } from './DatabaseLock';")
restore = restore.replace("ipcMain.handle('restore:execute', async (_, filePath: string): Promise<IpcResponse<void>> => {\n    try {\n      if (billingService.hasActiveDraft()) {", "ipcMain.handle('restore:execute', async (_, filePath: string): Promise<IpcResponse<void>> => {\n    if (DatabaseLock.isLocked()) return { success: false, error: { code: 'RESTORE_IN_PROGRESS', message: 'Restore already in progress' } };\n    try {\n      if (billingService.hasActiveDraft()) {")
restore = restore.replace("await restoreService.executeRestore(filePath);\n      \n      // Delay restart", "DatabaseLock.acquire();\n      try {\n        await restoreService.executeRestore(filePath);\n      } catch(err: any) {\n        DatabaseLock.release();\n        throw err;\n      }\n      \n      // Delay restart")
with open('electron/ipc/restore.handlers.ts', 'w') as f:
    f.write(restore)

print('Fixed IPC')
