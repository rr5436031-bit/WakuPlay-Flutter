import { call, listen } from './bridge'
export const LocalNotifications = {
  checkPermissions: () => call('LocalNotifications', 'checkPermissions', {}),
  requestPermissions: () => call('LocalNotifications', 'requestPermissions', {}),
  createChannel: (c) => call('LocalNotifications', 'createChannel', c),
  schedule: (o) => call('LocalNotifications', 'schedule', o),
  addListener: (ev, cb) => listen('LocalNotifications', ev, cb),
}
