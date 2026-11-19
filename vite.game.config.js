import lab from './vite.lab.config.js';
export default {...lab,build:{...lab.build,outDir:'dist-game',rollupOptions:{input:'game.html'}}};
