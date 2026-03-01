export const messages = {
  en: {
    subtitle: "Attention monitoring for kids",
    start: "Start",
    cameraLoading: "Camera loading...",
    description:
      "Detects in real-time whether the user is looking at the screen.",
    cameraPermission: "Camera permission is required.",

    attentive: "Attentive",
    lookingAway: "Looking Away",
    drowsy: "Drowsy",
    absent: "Absent",
    attentionRate: "Attention Rate",
    distractionCount: "Distractions",
    attentiveTime: "Focus Time",
    totalTime: "Total Time",
    times: "",
    finish: "Finish",

    hours: "h ",
    minutes: "m ",
    seconds: "s",
  },
  ko: {
    subtitle: "아이 집중력 모니터링",
    start: "시작",
    cameraLoading: "카메라 로딩...",
    description: "화면을 보고 있는지 실시간으로 감지합니다.",
    cameraPermission: "카메라 권한이 필요합니다.",

    attentive: "집중 중",
    lookingAway: "시선 이탈",
    drowsy: "졸림",
    absent: "자리 비움",
    attentionRate: "집중률",
    distractionCount: "이탈 횟수",
    attentiveTime: "집중 시간",
    totalTime: "전체 시간",
    times: "회",
    finish: "종료",

    hours: "시간 ",
    minutes: "분 ",
    seconds: "초",
  },
} as const;

export type Locale = keyof typeof messages;
