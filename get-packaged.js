const { app } = require('electron');
app.whenReady().then(() => {
  console.log("IS PACKAGED:", app.isPackaged);
  app.quit();
});
