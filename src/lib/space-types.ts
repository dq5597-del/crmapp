// 空間類型（AV 場勘用）
// 每一類附典型使用情境、核心硬體設計概念、場勘重點，供業務／工程在建案時對照。

export interface SpaceType {
  value: string        // 存入 projects.scene_name
  scenario: string     // 典型使用情境
  hardware: string[]   // 核心硬體設計概念
  survey: string[]     // 場勘與基礎設施重點（Site Survey）
}

export const SPACE_TYPES: SpaceType[] = [
  {
    value: '董事會議室（Boardrooms）',
    scenario: '集團總部、校長室高階決策會議。要求科技隱形與高尊榮感。',
    hardware: [
      '天花板陣列麥克風（隱藏收音）',
      '高階自動追蹤雙鏡頭',
      '一鍵連動中控系統（燈光／窗簾）',
    ],
    survey: [
      '美觀優先：桌面絕不挖洞，線路要完美隱藏。',
      '不當機原則：控制主機需走穩定的 RS-232／有線 IP。',
    ],
  },
  {
    value: '一般會議室（Conference Rooms）',
    scenario: '各部門日常週會、外部廠商簡報。強調高頻率使用與隨插即用。',
    hardware: [
      '75–85 吋專業商用顯示器',
      '一體化視訊桿（Video Bar）',
      'USB-C 一線通（支援 PD 充電）',
    ],
    survey: [
      'BYOD 相容性：備齊高品質主動式轉接線（Mac／Windows 通用）。',
      '選用商用顯示器而非家用電視（確保耐操且具控制孔）。',
    ],
  },
  {
    value: '小組討論室（Huddle Rooms）',
    scenario: '3–5 人臨時腦力激盪、快速專案對齊。強調快速與無線化。',
    hardware: [
      '無線投屏網關（免插線）',
      '120° 以上超廣角鏡頭',
      '55–65 吋高 CP 值商用電視',
    ],
    survey: [
      '鏡頭視角：桌子緊貼螢幕，一定要選超廣角，否則兩側同仁會出鏡。',
      '確保 Wi-Fi 訊號強度足以支撐無線投屏。',
    ],
  },
  {
    value: '培訓／多功能教室（Training Rooms）',
    scenario: '員工訓練、階梯大堂課、技術研討會。強調大面積覆蓋。',
    hardware: [
      '分區分佈式天花板喇叭',
      '音訊 DSP 處理器（消除鳴叫）',
      '中後段懸掛同步輔助顯示器（Repeater）',
    ],
    survey: [
      '視線補償：現勘要量測後排視線（Sightlines），不夠高就要加電視。',
      '防鳴叫：講師拿麥克風走動，喇叭需避開講台正上方。',
    ],
  },
  {
    value: '大禮堂／演藝廳（Auditoriums）',
    scenario: '畢業典禮、全體大會、大型藝文演出。強調高功率與大骨幹。',
    hardware: [
      '大型 LED 電視牆',
      '專業線陣列喇叭（Line Array）',
      '時序電源控制器（分批啟動）',
    ],
    survey: [
      '電力大坑：原廠要兩路 220V，現勘必查配電盤總容量，建議拉三相四線。',
      '訊號大骨幹：長距離全面走 75Ω SDI 線或影音光纖。',
    ],
  },
  {
    value: '可分割空間（Divisible Spaces）',
    scenario: '飯店宴會廳、大型活動中心。隨隔屏拉開或收起變換模式。',
    hardware: [
      '可程式化音訊 DSP 矩陣',
      '影視頻矩陣切換器',
      '隔屏軌道連動感應開關',
    ],
    survey: [
      '燒腦程式：報價一定要算入「中控切換邏輯開發費」。',
      '聲學隔離：提醒客戶注意隔屏隔音，否則隔壁上課這邊聽得一清二楚。',
    ],
  },
  {
    value: '專用視訊會議室（Videoconference Rooms）',
    scenario: '高頻率跨國談判、遠距醫療。追求面對面的臨場感。',
    hardware: [
      '雙螢幕配置（一邊人臉／一邊簡報）',
      'AI 人臉與發言者自動追蹤鏡頭',
      '專業環境回音消除處理',
    ],
    survey: [
      '裝潢材質：現勘嚴禁玻璃或大理石牆（回音太大），強烈建議做吸音軟包。',
      '長官背牆需為無光澤純色，避免失焦。',
    ],
  },
  {
    value: '科技法庭（Courtrooms）',
    scenario: '案件審理、遠端證人視訊。強調嚴謹存證與隱私。',
    hardware: [
      '高解析實物攝影機（展示微小證物）',
      '席位獨立發言麥克風（含音訊閘）',
      '語音掩蔽系統',
    ],
    survey: [
      '語音隱私：法官與律師密談不能外洩，音響系統需做嚴格分區。',
      '多路數位影音錄影設備必須有高可靠度備援。',
    ],
  },
  {
    value: '博物館／展覽空間（Museums & Galleries）',
    scenario: '數位光影藝術展、互動式導覽。強調沉浸感與長效穩定。',
    hardware: [
      '高流明雷射投影機（支援邊緣融合）',
      '媒體伺服器（Media Server）',
      'DMX-512 舞台燈光連控主機',
    ],
    survey: [
      '散熱與耐燃：展館長年開機，機櫃散熱要計算熱負載（HVAC）。',
      '線材需採用低煙無鹵（LSZH）耐燃等級，符合 AHJ（消防法規）。',
    ],
  },
  {
    value: '體育館／球場（Stadiums）',
    scenario: '職業球賽、萬人演唱會。強調極端安全與全天候防護。',
    hardware: [
      '中央懸吊漏斗型 LED 大螢幕',
      'IP55 以上防雨防塵強指向喇叭',
      '高階光纖傳輸骨幹系統',
    ],
    survey: [
      '結構承重：現勘必看結構工程圖，幾噸重的喇叭掛半空，鋼索吊點是第一要務。',
      '穿透萬人噪音的超大功率配置。',
    ],
  },
  {
    value: '其他',
    scenario: '不屬於上述分類的空間，請於說明／備註補充。',
    hardware: [],
    survey: [],
  },
]

export const SPACE_TYPE_VALUES = SPACE_TYPES.map(s => s.value)

export function findSpaceType(value: string | null | undefined): SpaceType | undefined {
  if (!value) return undefined
  return SPACE_TYPES.find(s => s.value === value)
}
