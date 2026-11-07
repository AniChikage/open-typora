import { _electron } from 'playwright/test';

// Existing interaction suites deliberately use Chinese labels and sample names.
// Keep their fixture locale independent of the developer/CI operating system.
export const electron = {
  launch(options: Parameters<typeof _electron.launch>[0] = {}) {
    return _electron.launch({ ...options,
      args: ['--lang=zh-CN', ...(options.args || [])],
      env: { ...(options.env || process.env), LC_ALL: 'zh_CN.UTF-8' },
    });
  },
};
