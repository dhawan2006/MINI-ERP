import { contextBridge, ipcRenderer } from 'electron';
import { IpcApi } from '../src/shared/ipc-contracts';

const api: IpcApi = {
  system: {
    ping: () => ipcRenderer.invoke('system:ping'),
    factoryReset: () => ipcRenderer.invoke('system:factoryReset'),
  },
  billing: {
    loadDraft: () => ipcRenderer.invoke('billing:loadDraft'),
    addProduct: (productId) => ipcRenderer.invoke('billing:addProduct', productId),
    addByBarcode: (barcode) => ipcRenderer.invoke('billing:addByBarcode', barcode),
    setQuantity: (productId, quantity) => ipcRenderer.invoke('billing:setQuantity', productId, quantity),
    removeItem: (productId) => ipcRenderer.invoke('billing:removeItem', productId),
    undo: () => ipcRenderer.invoke('billing:undo'),
    clear: () => ipcRenderer.invoke('billing:clear'),
    finalize: () => ipcRenderer.invoke('billing:finalize'),
    hasActiveDraft: () => ipcRenderer.invoke('billing:hasActiveDraft'),
  },
  products: {
    findByBarcode: (barcode) => ipcRenderer.invoke('products:findByBarcode', barcode),
    searchActiveByPrefix: (prefix) => ipcRenderer.invoke('products:searchActiveByPrefix', prefix),
    create: (name, priceMinor, barcode) => ipcRenderer.invoke('products:create', name, priceMinor, barcode),
    update: (id, name, priceMinor, barcode) => ipcRenderer.invoke('products:update', id, name, priceMinor, barcode),
    setActive: (id, isActive) => ipcRenderer.invoke('products:setActive', id, isActive),
    list: (limit, offset, includeInactive) => ipcRenderer.invoke('products:list', limit, offset, includeInactive),
    search: (term, limit, includeInactive) => ipcRenderer.invoke('products:search', term, limit, includeInactive),
    deleteAll: () => ipcRenderer.invoke('products:deleteAll'),
  },
  printing: {
    createPrintJob: (billId) => ipcRenderer.invoke('printing:createPrintJob', billId),
    getJobStatus: (jobId) => ipcRenderer.invoke('printing:getJobStatus', jobId),
    retryPrintJob: (billId) => ipcRenderer.invoke('printing:retryPrintJob', billId),
  },
  pdf: {
    exportBill: (billId) => ipcRenderer.invoke('pdf:exportBill', billId),
    openFile: (filePath) => ipcRenderer.invoke('pdf:openFile', filePath),
  },
  history: {
    list: (params) => ipcRenderer.invoke('history:list', params),
    getDetails: (billId) => ipcRenderer.invoke('history:getDetails', billId),
    searchByBillNumber: (billNumber) => ipcRenderer.invoke('history:searchByBillNumber', billNumber)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: any) => ipcRenderer.invoke('settings:update', settings),
    testPrint: (draftConfig?: any) => ipcRenderer.invoke('settings:testPrint', draftConfig),
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
  },
  restore: {
    validate: () => ipcRenderer.invoke('restore:validate'),
    execute: (filePath) => ipcRenderer.invoke('restore:execute', filePath),
  },
  licensing: {
    getState: () => ipcRenderer.invoke('license:getState'),
    activate: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
    onStateChanged: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, dto: any) => callback(dto);
      ipcRenderer.on('license:stateChanged', handler);
      // Return an unsubscribe function
      return () => ipcRenderer.removeListener('license:stateChanged', handler);
    },
  },

};

contextBridge.exposeInMainWorld('api', api);

