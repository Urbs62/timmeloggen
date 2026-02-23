const SETTINGS_KEY = "tl_settings_v1";

function loadSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch{
    return {};
  }
}

function saveSettings(s){
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function saveSettingsMerge(patch){
  const prev = loadSettings();
  const next = { ...prev, ...patch };
  saveSettings(next);
  return next;
}
