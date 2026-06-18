const fs = require('fs');
const path = require('path');

// データの保存先ファイル
const DATA_FILE = path.join(__dirname, 'today_unyo.json');

// APIのURL
const URLS = {
  toyoko: ["https://w-tid.jp/tokyu/toyoko.json", "https://w-tid.jp/tokyu/shinyokohama.json"],
  meguro: ["https://w-tid.jp/tokyu/meguro.json", "https://w-tid.jp/tokyu/shinyokohama.json"],
  dento: ["https://w-tid.jp/tokyu/dento.json"]
};

// 外部の静的マスタマッピング（元コードのJSON）
const TOKYU_JSON_URL = "https://nfhanyo.web.fc2.com/tokyu/tokyu_data.json";

async function loadMasterData() {
  const res = await fetch(TOKYU_JSON_URL);
  return await res.json();
}

async function fetchJson(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : { trains: [] };
  } catch (e) {
    return { trains: [] };
  }
}

async function main() {
  // 1. 既存の蓄積データがあれば読み込む（なければ新規作成）
  let currentUnyoData = { toyoko: {}, meguro: {}, dento: {}, lastUpdate: "" };
  if (fs.existsSync(DATA_FILE)) {
    try {
      currentUnyoData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {}
  }

  // 日本時間の日付を取得
  const nowJST = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
  const todayStr = nowJST.toISOString().split('T')[0];

  // 日付が変わっていたら（初電のタイミングなどで）データを一新リセット
  if (currentUnyoData.date !== todayStr) {
    currentUnyoData = { date: todayStr, toyoko: {}, meguro: {}, dento: {} };
  }

  // 東横・目黒のマスタ読み込み
  const master = await loadMasterData();
  const toyokoFormations = master.lines?.toyoko?.formations || [];
  const meguroFormations = master.lines?.meguro?.formations || [];

  // --- 東横線の処理 ---
  const toyokoRaw = await Promise.all(URLS.toyoko.map(fetchJson));
  const toyokoTrains = toyokoRaw.flatMap(d => d.trains || []);
  const seenToyoko = new Set();

  for (const t of toyokoTrains) {
    if (!t || !t.train_number || t.train_number.length < 5 || seenToyoko.has(t.train_number)) continue;
    seenToyoko.add(t.train_number);
    if (["2","3","4","5","6"].includes(t.train_number[1])) continue;
    if ([54,67,71,73,76,77].includes(t.destination_station_code)) continue;

    const opDisp = t.train_number.slice(2,4) + ({"9":"G","8":"T","7":"S","1":"M","0":"K"}[t.train_number[1]]||"");
    const formMatch = toyokoFormations.find(f => f.label === `${t.num_of_cars}${t.affiliation}${t.train_orchestration_number}`);
    const formStr = formMatch ? formMatch.formation : "-";

    currentUnyoData.toyoko[opDisp] = {
      op: opDisp,
      form: formStr,
      cars: t.num_of_cars,
      no: t.train_number.slice(1,4) + "-" + t.train_number.slice(4,7),
      destCode: t.destination_station_code,
      delay: t.delay_time ? `+${t.delay_time}` : "",
      updatedAt: nowJST.toLocaleTimeString('ja-JP')
    };
  }

  // --- 目黒線の処理 ---
  const meguroRaw = await Promise.all(URLS.meguro.map(fetchJson));
  const meguroTrains = meguroRaw.flatMap(d => d.trains || []);
  const seenMeguro = new Set();

  for (const t of meguroTrains) {
    if (!t.train_number || seenMeguro.has(t.train_number)) continue;
    seenMeguro.add(t.train_number);
    if (['0','7','9','8'].includes(t.train_number[1])) continue;

    let numberPart = t.train_number.slice(1).padStart(6,'0');
    const trainNumberDisplay = numberPart.slice(0,3)+'-'+numberPart.slice(3,6);
    if (trainNumberDisplay === "999-990" || [33,78,84,93,98,103].includes(t.destination_station_code)) continue;

    let opNumSuffix = {"6":"G","5":"M","4":"T","3":"S","2":"K","0":"K"}[t.operation_number.toString()[0]] || "";
    const opDisp = t.operation_number.toString().slice(-2) + opNumSuffix;

    const formMatch = meguroFormations.find(f => f.label === `${t.num_of_cars}${t.affiliation}${t.train_orchestration_number}`);
    const formStr = formMatch ? formMatch.formation : "-";

    currentUnyoData.meguro[opDisp] = {
      op: opDisp,
      form: formStr,
      cars: t.num_of_cars,
      no: trainNumberDisplay,
      destCode: t.destination_station_code,
      delay: t.delay_time ? `+${t.delay_time}` : "",
      updatedAt: nowJST.toLocaleTimeString('ja-JP')
    };
  }

  // --- 田園都市線の処理 ---
  const dentoRaw = await fetchJson(URLS.dento[0]);
  const dentoTrains = dentoRaw.trains || [];

  for (const t of dentoTrains) {
    if (!t.train_number) continue;
    const num = t.train_number.slice(1,7);
    if (num[0] === "1" && t.kind !== "回") continue;

    const trainNumberDisplay = `${num[0]}${num[1]}${num[2]}-${num[3]}${num[4]}${num[5]}`;
    let opDisp = "";
    if (t.kind === "回" && t.train_number && t.train_number[1] === "1") {
      opDisp = String(t.operation_number);
    } else {
      opDisp = ("00" + t.operation_number).slice(-2) + ((t.operation_number < 50 || t.operation_number >= 96) ? "K" : (t.operation_number % 2 === 0 ? "T" : "S"));
    }

    let kind = t.kind;
    if(kind==='普') kind='各駅停車';
    else if(kind==='急') kind='急行';
    else if(kind==='準') kind='準急';
    else if(kind==='回') kind='回送';

    currentUnyoData.dento[opDisp] = {
      op: opDisp,
      no: trainNumberDisplay,
      kind: kind,
      destCode: t.destination_station_code,
      delay: t.delay_time ? `+${t.delay_time}` : "",
      updatedAt: nowJST.toLocaleTimeString('ja-JP')
    };
  }

  // タイムスタンプを更新してファイル書き込み
  currentUnyoData.lastUpdate = nowJST.toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
  fs.writeFileSync(DATA_FILE, JSON.stringify(currentUnyoData, null, 2), 'utf8');
  console.log(`データ更新完了: ${currentUnyoData.lastUpdate}`);
}

main();
