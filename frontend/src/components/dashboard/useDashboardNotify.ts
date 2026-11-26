import { App } from 'antd';

export function useDashboardNotify() {
  const { message, notification } = App.useApp();
  return { message, notification };
}
