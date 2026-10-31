import { listen, call } from './bridge'
export const App = {
  addListener: (ev, cb) => listen('App', ev, cb),
  exitApp: () => call('App', 'exitApp', {}),
}
