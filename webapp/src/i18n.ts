export type AppLocale = 'zh-CN' | 'en-US';

type MessageKey = string;

const messages: Record<AppLocale, Record<MessageKey, string>> = {
  'zh-CN': {
    'app.title': '氛围时钟',
    'landing.subtitle': '时间与声音，为 PixelMug 营造属于你的日常氛围。',
    'clock.title': '时钟', 'clock.styles': '时钟样式',
    'sound.title': '声音', 'sound.volume': '音量', 'sound.sleepTimer': '睡眠定时',
    'sound.sleepHint': '定时结束后仅停止声音，时钟仍会继续显示。',
    'sound.clockEffects': '时钟音效', 'sound.whiteNoise': '白噪音', 'sound.mySounds': '我的声音',
    'sound.off': '关闭', 'sound.oneHour': '1 小时', 'sound.minutes': '{minutes} 分钟',
    'sound.edit': '修改声音', 'sound.delete': '删除声音', 'sound.add': '添加声音',
    'sound.name': '名称', 'sound.namePlaceholder': '例如：咖啡馆氛围', 'sound.audioUrl': '音频 URL',
    'sound.save': '保存修改', 'sound.nameRequired': '请输入声音名称。',
    'sound.urlInvalid': '请输入有效的 http 或 https Ogg/Opus 音频地址。',
    'timezone.current': '当前时区', 'timezone.chooseOther': '选择其他时区',
    'timezone.choose': '选择时区', 'timezone.search': '搜索城市或时区',
    'action.done': '完成', 'action.cancel': '取消', 'action.opening': '正在打开…',
    'action.retry': '重试', 'action.openOnPixelMug': '在 PixelMug 上打开',
    'action.applying': '正在应用…', 'action.connecting': '连接中…',
    'action.applyToPixelMug': '应用到 PixelMug', 'action.connectPixelMug': '连接 PixelMug',
    'ble.connected': 'BLE 已连接', 'ble.connectingSeconds': '连接中 {seconds}s',
    'ble.timeout': '连接超时', 'ble.connect': '连接 BLE',
    'ble.connectionTimeout': '蓝牙连接超时，请重试。', 'ble.disconnected': 'PixelMug 蓝牙已断开。',
    'nav.pages': '应用页面', 'preview.suffix': '（浏览器预览模式）',
    'style.flip': '翻页', 'style.pixel': '彩色数字', 'style.matrix': '代码雨',
    'sound.clockTick1': '清脆翻页', 'sound.clockTick2': '快速秒针',
    'sound.clockTick3': '厚重滴答', 'sound.clockTick4': '轻柔滴答',
    'sound.clockTick5': '滴答时钟', 'sound.clockTick6': '翻页时钟',
    'sound.rain': '雨声', 'sound.fire': '篝火',
    'city.honolulu': '檀香山', 'city.losAngeles': '洛杉矶', 'city.denver': '丹佛',
    'city.chicago': '芝加哥', 'city.newYork': '纽约', 'city.saoPaulo': '圣保罗',
    'city.london': '伦敦', 'city.paris': '巴黎', 'city.cairo': '开罗', 'city.dubai': '迪拜',
    'city.kolkata': '加尔各答', 'city.bangkok': '曼谷', 'city.shanghai': '上海',
    'city.tokyo': '东京', 'city.sydney': '悉尼', 'city.auckland': '奥克兰',
    'status.finding': '正在查找 PixelMug…', 'status.notFound': '没有找到已绑定的 PixelMug S1。',
    'status.starting': '正在启动氛围时钟…', 'status.startedConnecting': '氛围时钟已启动，正在连接蓝牙…',
    'status.connecting': '正在连接 PixelMug…', 'status.connected': 'PixelMug 已连接。',
    'status.applying': '正在应用配置…', 'status.applied': '已应用到 PixelMug。',
    'status.installing': '正在安装氛围时钟…', 'status.switching': '正在切换到氛围时钟…',
    'status.started': '氛围时钟已启动。', 'status.unknownError': '未知错误',
    'launch.missingConfig': '缺少 MPS 安装参数。',
    'launch.failed': '无法启动氛围时钟（错误码 {code}）。',
    'launch.installFailed': '安装氛围时钟失败（错误码 {code}）。',
    'launch.appFailed': '氛围时钟启动失败。',
    'launch.deviceFailed': '设备端应用启动失败。',
    'launch.timeout': '等待氛围时钟启动超时。',
  },
  'en-US': {
    'app.title': 'Ambient Clock',
    'landing.subtitle': 'Time and sound create the perfect everyday atmosphere on PixelMug.',
    'clock.title': 'Clock', 'clock.styles': 'Clock Styles',
    'sound.title': 'Sound', 'sound.volume': 'Volume', 'sound.sleepTimer': 'Sleep Timer',
    'sound.sleepHint': 'Only the sound stops when the timer ends; the clock stays on screen.',
    'sound.clockEffects': 'Clock Sounds', 'sound.whiteNoise': 'White Noise', 'sound.mySounds': 'My Sounds',
    'sound.off': 'Off', 'sound.oneHour': '1 hour', 'sound.minutes': '{minutes} min',
    'sound.edit': 'Edit sound', 'sound.delete': 'Delete sound', 'sound.add': 'Add Sound',
    'sound.name': 'Name', 'sound.namePlaceholder': 'For example: Café ambience', 'sound.audioUrl': 'Audio URL',
    'sound.save': 'Save Changes', 'sound.nameRequired': 'Enter a sound name.',
    'sound.urlInvalid': 'Enter a valid HTTP or HTTPS Ogg/Opus audio URL.',
    'timezone.current': 'Current Time Zone', 'timezone.chooseOther': 'Choose Another Time Zone',
    'timezone.choose': 'Choose Time Zone', 'timezone.search': 'Search cities or time zones',
    'action.done': 'Done', 'action.cancel': 'Cancel', 'action.opening': 'Opening…',
    'action.retry': 'Retry', 'action.openOnPixelMug': 'Open on PixelMug',
    'action.applying': 'Applying…', 'action.connecting': 'Connecting…',
    'action.applyToPixelMug': 'Apply to PixelMug', 'action.connectPixelMug': 'Connect PixelMug',
    'ble.connected': 'BLE Connected', 'ble.connectingSeconds': 'Connecting {seconds}s',
    'ble.timeout': 'Connection Timed Out', 'ble.connect': 'Connect BLE',
    'ble.connectionTimeout': 'Bluetooth connection timed out. Try again.',
    'ble.disconnected': 'PixelMug Bluetooth disconnected.',
    'nav.pages': 'App pages', 'preview.suffix': ' (browser preview mode)',
    'style.flip': 'Flip', 'style.pixel': 'Color Digits', 'style.matrix': 'Code Rain',
    'sound.clockTick1': 'Crisp Flip', 'sound.clockTick2': 'Fast Second Hand',
    'sound.clockTick3': 'Heavy Tick', 'sound.clockTick4': 'Soft Tick',
    'sound.clockTick5': 'Tick Tock', 'sound.clockTick6': 'Flip Clock',
    'sound.rain': 'Rain', 'sound.fire': 'Campfire',
    'city.honolulu': 'Honolulu', 'city.losAngeles': 'Los Angeles', 'city.denver': 'Denver',
    'city.chicago': 'Chicago', 'city.newYork': 'New York', 'city.saoPaulo': 'São Paulo',
    'city.london': 'London', 'city.paris': 'Paris', 'city.cairo': 'Cairo', 'city.dubai': 'Dubai',
    'city.kolkata': 'Kolkata', 'city.bangkok': 'Bangkok', 'city.shanghai': 'Shanghai',
    'city.tokyo': 'Tokyo', 'city.sydney': 'Sydney', 'city.auckland': 'Auckland',
    'status.finding': 'Finding PixelMug…', 'status.notFound': 'No bound PixelMug S1 was found.',
    'status.starting': 'Starting Ambient Clock…', 'status.startedConnecting': 'Ambient Clock started. Connecting Bluetooth…',
    'status.connecting': 'Connecting to PixelMug…', 'status.connected': 'PixelMug connected.',
    'status.applying': 'Applying settings…', 'status.applied': 'Applied to PixelMug.',
    'status.installing': 'Installing Ambient Clock…', 'status.switching': 'Switching to Ambient Clock…',
    'status.started': 'Ambient Clock started.', 'status.unknownError': 'Unknown error',
    'launch.missingConfig': 'Missing MPS installation parameters.',
    'launch.failed': 'Could not start Ambient Clock (error code {code}).',
    'launch.installFailed': 'Ambient Clock installation failed (error code {code}).',
    'launch.appFailed': 'Ambient Clock failed to start.',
    'launch.deviceFailed': 'The device app failed to start.',
    'launch.timeout': 'Timed out waiting for Ambient Clock to start.',
  },
};

export const currentLocale: AppLocale = detectLocale();

export function t(key: MessageKey, params: Record<string, string | number> = {}) {
  const template = messages[currentLocale][key] || messages['en-US'][key] || key;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.split('{' + name + '}').join(String(value)),
    template,
  );
}

function detectLocale(): AppLocale {
  return (globalThis as { JeeWeb?: { Language?: string } }).JeeWeb?.Language === 'zh-CN'
    ? 'zh-CN'
    : 'en-US';
}
