// #!/usr/bin/env node

// // Fix module resolution for Electron
// console.log("ELECTRON SETUP");
// const Module = require("module");
// const path = require("path");

// const originalResolveFilename = Module._resolveFilename;
// Module._resolveFilename = function (request: any, parent: any, isMain: any) {
//   if (request.startsWith("tennyson/")) {
//     const buildPath = path.join(__dirname, "..", "..", "build");
//     return originalResolveFilename.call(
//       this,
//       path.join(buildPath, request),
//       parent,
//       isMain,
//     );
//   }
//   return originalResolveFilename.call(this, request, parent, isMain);
// };

// const { app, BrowserWindow } = require("electron");

// function createGoogleWindow() {
//   const win = new BrowserWindow({ width: 1200, height: 800 });
//   win.loadURL("https://google.com");
// }

// function createD3Window() {
//   const html = `<!doctype html><meta charset="utf-8">
//   <body style="margin:0;background:#0b1020;color:#e6e6e6;font:14px system-ui">
//   <div style="padding:10px">Move mouse = drag dot. Click dot = random color.</div>
//   <script>
//   const d3=require('d3'),w=640,h=360;
//   const svg=d3.select('body').append('svg').attr('viewBox',[0,0,w,h]).style('display','block');
//   const c=svg.append('circle').attr('cx',w/2).attr('cy',h/2).attr('r',28).attr('fill','steelblue');
//   svg.on('mousemove',e=>{const [x,y]=d3.pointer(e); c.attr('cx',x).attr('cy',y);});
//   c.on('click',()=>c.attr('fill',d3.schemeCategory10[(Math.random()*10)|0]));
//   </script></body>`;

//   const win = new BrowserWindow({
//     width: 720,
//     height: 480,
//     webPreferences: { nodeIntegration: true, contextIsolation: false }, // demo-only
//   });

//   win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
// }

// app.whenReady().then(() => {
//   // createGoogleWindow();
//   createD3Window(); // new page/window with D3
// });
