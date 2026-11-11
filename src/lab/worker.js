import { runGame } from './run.js';
import { initGame } from '../game/engine.js';
import { chooseLabCommand, resetRolloutStats } from '../game/ai.js';
let liveInitialized = false;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'decide') {
      if (!liveInitialized) {
        initGame(data.config);
        liveInitialized = true;
      }
      resetRolloutStats();
      self.postMessage({ type:'decision', command:chooseLabCommand(data.state) });
    } else {
      const game = await runGame(data.config, progress => self.postMessage({ type:'progress', ...progress, index:data.index }));
      self.postMessage({ type:'game', index:data.index, game });
    }
  } catch(e) { self.postMessage({ type:'error', message:e.message }); }
};
