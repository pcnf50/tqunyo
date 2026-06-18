const fs = require('fs');

const API_URL = "https://ers.tokyu.co.jp/ers/api/v1/train/location";
const FILE_PATH = "./today_unyo.json";

// 対象路線の定義
const TARGET_LINES = {
  toyoko: "TY",
  meguro: "MG"
};

async function fetchTrainLocation() {
  try {
    // 既存データの読み込み（日付が変わったらリセットするための判定）
    let unyoData = { toyoko: {}, meguro: {}, lastUpdate: "" };
    
    // 日本時間（JST）の現在時刻を取得
    const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
    const todayStr = now.toISOString().split('T')[0]; // "2026-06-18" 
    const timeStr = now.toISOString().split('T')[1].substring(0, 5); // "13:45"

    if (fs.existsSync(FILE_PATH)) {
      try {
        const fileContent = fs.readFileSync(FILE_PATH, 'utf8');
        const parsed = JSON.parse(fileContent);
        // 保存されている日付が今日と同じならデータを引き継ぐ
        if (parsed.date === todayStr) {
          unyoData = parsed;
        }
      } catch (e) {
        console.log("既存データの解析に失敗したためリセットします");
      }
    }

    // 日付を更新
    unyoData.date = todayStr;
    unyoData.lastUpdate = timeStr;

    // 各路線のデータを取得して解析
    for (const [lineKey, lineCode] of Object.entries(TARGET_LINES)) {
      const response = await fetch(`${API_URL}/${lineCode}`);
      if (!response.ok) continue;
      
      const json = await response.json();
      const trains = json.body || [];

      trains.forEach(train => {
        // 運用番号（op）、編成番号（form）が両方存在する場合のみ記録
        if (train.unyo && train.possessionFormNo) {
          const opNo = train.unyo; // 例: "01K"
          const formNo = train.possessionFormNo; // 例: "5151F"
          
          // 車両数・遅延の判定
          const cars = train.trackLength || "8";
          const delayMin = train.delayMinute ? `${train.delayMinute}分遅れ` : "";

          // ★重要：行き先コード（strDestCode）を取得
          const destCode = train.strDestCode || "";

          // データを上書き・または新規追加
          unyoData[lineKey][opNo] = {
            op: opNo,
            form: formNo,
            cars: cars,
            no: train.trainNo || "", // 列車番号
            destCode: destCode,      // ★ここを追加！index.htmlに駅コードを渡す
            delay: delayMin
          };
        }
      });
    }

    // データの保存
    fs.writeFileSync(FILE_PATH, JSON.stringify(unyoData, null, 2), 'utf8');
    console.log(`データ収集成功: ${timeStr}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
    process.exit(1);
  }
}

fetchTrainLocation();
