import { call } from './bridge'
export const SocialLogin = {
  initialize: (o) => call('SocialLogin', 'initialize', o),
  login: (o) => call('SocialLogin', 'login', o),
  logout: (o) => call('SocialLogin', 'logout', o),
  refresh: (o) => call('SocialLogin', 'refresh', o),
}
