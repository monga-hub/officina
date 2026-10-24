import { runGame } from './run.js';
import { initGame } from '../game/engine.js';
import { chooseCommand } from '../game/ai.js';
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'decide') {
      initGame(data.config); // Restore this worker's card registry before evaluating a snapshot.
      self.postMessage({ type:'decision', command:chooseCommand(data.state) });
    } else {
      const game = await runGame(data.config, progress => self.postMessage({ type:'progress', ...progress, index:data.index }));
      self.postMessage({ type:'game', index:data.index, game });
    }
  } catch(e) { self.postMessage({ type:'error', message:e.message }); }
};
