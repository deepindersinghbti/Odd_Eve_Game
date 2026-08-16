export const PRESENTATION_STATUS = Object.freeze({
  IDLE: 'IDLE',
  COMPUTER_THINKING: 'COMPUTER_THINKING',
  REVEAL_READY: 'REVEAL_READY',
  SHOWING_REVEAL: 'SHOWING_REVEAL',
});

export const PRESENTATION_CONTEXT = Object.freeze({
  TOSS: 'TOSS',
  DELIVERY: 'DELIVERY',
  ROLE_CHOICE: 'ROLE_CHOICE',
});

export const DEFAULT_DELAY_RANGE = Object.freeze({
  minimum: 400,
  maximum: 800,
});
