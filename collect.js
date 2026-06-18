const fs = require('fs');

const BASE_API_URL = "https://w-tid.jp/tokyu";
const FILE_PATH = "./today_unyo.json";

// マスタデータURL
const TOKYU_JSON_URL = "https://nfhanyo.web.fc2.com/tokyu/tokyu_data.json";
const DENTO_JSON_URL = "https://nfhanyo.web.fc2.com/tokyu/tokyu_dentodata.json";

async function fetchTrainLocation() {
  try {
    let unyoData = { toyoko: {}, meguro: {}, dento: {}, lastUpdate: "", date: "" };
    
    const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
    const todayStr = now.toISOString().split('T')[0]; 
    const timeStr = now.toISOString().split('T')[1].substring(0, 5); 

    // 既存データの読み込みと安全な初期化
    if (fs.existsSync(FILE_PATH)) {
      try {
        const fileContent = fs.readFileSync(FILE_PATH, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed && parsed.date === todayStr) {
          unyoData = parsed;
        }
      } catch (e) {
        console.log("既存データ解析失敗のためリセットします");
      }
    }

    // 各路線オブジェクトの存在を100%保証する（2枚目のエラー対策）
    unyoData.date = todayStr;
    unyoData.lastUpdate = timeStr;
    if (!unyoData.toyoko) unyoData.toyoko = {};
    if (!unyoData.meguro) unyoData.meguro = {};
    if (!unyoData.dento) unyoData.dento = {};

    // 各種マスタデータの事前取得
    const [tokyuRes, dentoRes] = await Promise.all([
      fetch(TOKYU_JSON_URL, { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
      fetch(DENTO_JSON_URL, { cache: "no-store" }).then(r => r.json()).catch(() => ({}))
    ]);

    const toyokoFormationList = tokyuRes.lines?.["toyoko"]?.formations || [];
    const meguroFormationList = tokyuRes.lines?.["meguro"]?.formations || [];

    // ============================================
    // 1. 東横線
    // ============================================
    try {
      const tyUrls = [`${BASE_API_URL}/toyoko.json`, `${BASE_API_URL}/shinyokohama.json`];
      const tyTrainsAll = [];
      for (const url of tyUrls) {
        const r = await fetch(url, { cache: "no-store" }).then(res => res.json()).catch(() => ({ trains: [] }));
        tyTrainsAll.push(...(r.trains || []));
      }
      const tySeen = new Set();

      for (const t of tyTrainsAll) {
        if (!t || !t.train_number || t.train_number.length < 5 || tySeen.has(t.train_number)) continue;
        tySeen.add(t.train_number);
        if (["2","3","4","5","6"].includes(t.train_number[1])) continue;
        if ([54,67,71,73,76,77].includes(t.destination_station_code)) continue;

        let kind = t.kind;
        if (kind === "普") kind = "各駅停車";
        else if (kind === "急") kind = "急行";
        else if (kind === "特") kind = "特急";
        else if (kind === "通") kind = "通勤特急";
        else if (kind === "Ｆ" || kind === "F") kind = "F特急";
        else if (kind === "Ｓ") kind = "Ｓトレイン";
        else if (kind === "回") kind = "回送";
        else kind = "不明";

        let opDisp = t.train_number.slice(2,4) + ({"9":"G","8":"T","7":"S","1":"M","0":"K"}[t.train_number[1]] || "");
        if (kind === "不明") opDisp = t.train_number.slice(2, 4);

        const labelStr = `${t.num_of_cars}${t.affiliation}${t.train_orchestration_number}`;
        const fMatch = toyokoFormationList.find(f => f.label === labelStr);
        const formNo = fMatch ? fMatch.formation : "-";
        const delayMin = t.delay_time ? `${t.delay_time}分遅れ` : "";

        unyoData.toyoko[opDisp] = {
          op: opDisp,
          form: formNo,
          cars: t.num_of_cars || "8",
          no: t.train_number.slice(1,4) + "-" + t.train_number.slice(4,7),
          destCode: String(t.destination_station_code || ""),
          kind: kind,
          delay: delayMin
        };
      }
    } catch (e) {
      console.error("東横線のデータ処理中にエラーが発生しました:", e);
    }

    // ============================================
    // 2. 目黒線
    // ============================================
    try {
      const mgUrls = [`${BASE_API_URL}/meguro.json`, `${BASE_API_URL}/shinyokohama.json`];
      const mgTrainsAll = [];
      for (const url of mgUrls) {
        const r = await fetch(url, { cache: "no-store" }).then(res => res.json()).catch(() => ({ trains: [] }));
        mgTrainsAll.push(...(r.trains || []));
      }
      const mgSeen = new Set();

      for (const t of mgTrainsAll) {
        if (!t || !t.train_number || mgSeen.has(t.train_number)) continue;
        mgSeen.add(t.train_number);
        if (['0','7','9','8'].includes(t.train_number[1])) continue;

        let numberPart = t.train_number.slice(1).padStart(6, '0');
        const trainNumberDisplay = numberPart.slice(0,3) + '-' + numberPart.slice(3,6);
        if (trainNumberDisplay === "999-990") continue;
        if ([33,78,84,93,98,103].includes(t.destination_station_code)) continue;

        let opNumSuffix = '';
        const opStr = String(t.operation_number || "");
        switch (opStr[0]) {
          case '6': opNumSuffix = 'G'; break;
          case '5': opNumSuffix = 'M'; break;
          case '4': opNumSuffix = 'T'; break;
          case '3': opNumSuffix = 'S'; break;
          case '2': opNumSuffix = 'K'; break;
          case '0': opNumSuffix = 'K'; break;
        }
        const opDisp = opStr.slice(-2) + opNumSuffix;

        let kind = t.kind;
        switch (kind) {
          case '普': kind = '各駅停車'; break;
          case '急': kind = '急行'; break;
          case '特': kind = '特急'; break;
          case '通': kind = '通勤特急'; break;
          case 'Ｆ': case 'F': kind = 'F特急'; break;
          case '回': kind = '回送'; break;
        }
        if (!kind && t.train_kind != null) {
          const km = { 2: "各駅停車", 4: "急行", 7: "F特急" };
          kind = km[t.train_kind] || "不明";
        }
        if (!kind) kind = "各駅停車";

        const labelStr = `${t.num_of_cars}${t.affiliation}${t.train_orchestration_number}`;
        const fMatch = meguroFormationList.find(f => f.label === labelStr);
        const formNo = fMatch ? fMatch.formation : '-';
        const delayMin = t.delay_time ? `${t.delay_time}分遅れ` : "";

        unyoData.meguro[opDisp] = {
          op: opDisp,
          form: formNo,
          cars: t.num_of_cars || "8",
          no: trainNumberDisplay,
          destCode: String(t.destination_station_code || ""),
          kind: kind,
          delay: delayMin
        };
      }
    } catch (e) {
      console.error("目黒線のデータ処理中にエラーが発生しました:", e);
    }

    // ============================================
    // 3. 田園都市線
    // ============================================
    try {
      const dtRes = await fetch(`${BASE_API_URL}/dento.json`, { cache: "no-store" }).then(res => res.json()).catch(() => ({ trains: [] }));
      for (const t of (dtRes.trains || [])) {
        if (!t.train_number) continue;
        const num = t.train_number.slice(1, 7);
        const p = num[0];
        if (p === "1" && t.kind !== "回") continue; 

        const trainNumberDisplay = `${p}${num[1]}${num[2]}-${num[3]}${num[4]}${num[5]}`;

        let opNo = t.operation_number;
        let opDisp = "";
        if (t.kind === "回" && t.train_number && t.train_number[1] === "1") {
          opDisp = String(opNo);
        } else {
          opDisp = ("00" + opNo).slice(-2) + ((opNo < 50 || opNo >= 96) ? "K" : (opNo % 2 === 0 ? "T" : "S"));
        }

        let kind = t.kind;
        switch (kind) {
          case '普': kind = '各駅停車'; break;
          case '急': kind = '急行'; break;
          case '準': kind = '準急'; break;
          case '回': kind = '回送'; break;
          default: kind = '各駅停車';
        }

        const delayMin = t.delay_time ? `${t.delay_time}分遅れ` : "";

        unyoData.dento[opDisp] = {
          op: opDisp,
          form: "-", 
          cars: "10", 
          no: trainNumberDisplay,
          destCode: String(t.destination_station_code || ""),
          kind: kind,
          delay: delayMin
        };
      }
    } catch (e) {
      console.error("田園都市線のデータ処理中にエラーが発生しました:", e);
    }

    // データの保存
    fs.writeFileSync(FILE_PATH, JSON.stringify(unyoData, null, 2), 'utf8');
    console.log(`データ収集成功: ${timeStr}`);

  } catch (error) {
    console.error("致命的なエラーが発生しました:", error);
    process.exit(1);
  }
}

fetchTrainLocation();
