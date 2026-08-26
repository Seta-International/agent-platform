import type { Interview, InterviewPanelist } from './interview-utils.ts';

export interface CandidatePoolItem {
  id: string;
  name: string;
  requisition_title: string;
}

// Placeholder pools for the "Schedule interview" form until it reads from the real candidate
// and directory lists.
export const FAKE_CANDIDATE_POOL: CandidatePoolItem[] = [
  { id: 'cand-01', name: 'Nguyen Thi Mai Anh', requisition_title: 'Senior React Engineer' },
  { id: 'cand-02', name: 'Tran Dinh Phong', requisition_title: 'DevOps Engineer' },
  { id: 'cand-03', name: 'Le Van Khanh', requisition_title: 'Go Backend Engineer' },
  { id: 'cand-04', name: 'Vo Thi Kim Ngan', requisition_title: 'Business Analyst' },
  { id: 'cand-05', name: 'Do Minh Tri', requisition_title: 'QA Automation Engineer' },
  { id: 'cand-06', name: 'Vu Hoang Yen', requisition_title: 'Senior ML Engineer' },
  { id: 'cand-07', name: 'Pham Hong Son', requisition_title: 'Kafka Platform Engineer' },
];

export const FAKE_PANEL_POOL: InterviewPanelist[] = [
  { user_id: 'panel-01', display_name: 'Nguyen Anh Thai' },
  { user_id: 'panel-02', display_name: 'Pham Quoc Bao' },
  { user_id: 'panel-03', display_name: 'Tran Thu Ha' },
  { user_id: 'panel-04', display_name: 'Hoang Thi Lan' },
  { user_id: 'panel-05', display_name: 'Vo Thanh Dat' },
  { user_id: 'panel-06', display_name: 'Nguyen Khanh Linh' },
];

function panel(...names: string[]): InterviewPanelist[] {
  return FAKE_PANEL_POOL.filter((p) => names.includes(p.display_name));
}

// Every scheduled_at is an offset from the moment the module loads, so the agenda's day
// buckets (Today / Tomorrow / This week / Later) always have something in them regardless of
// when this is opened.
function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function buildFakeInterviews(): Interview[] {
  return [
    {
      id: 'int-01',
      candidate_id: 'cand-08',
      candidate_name: 'Ngo Gia Bao',
      requisition_title: 'Frontend Engineer',
      round: 'Final',
      scheduled_at: at(-2, 11, 0),
      duration_minutes: 60,
      mode: 'onsite',
      meeting_link: null,
      panel: panel('Pham Quoc Bao', 'Nguyen Khanh Linh'),
      note: 'Architecture deep-dive, still open — flag if this got recorded elsewhere.',
      status: 'scheduled',
    },
    {
      id: 'int-02',
      candidate_id: 'cand-01',
      candidate_name: 'Nguyen Thi Mai Anh',
      requisition_title: 'Senior React Engineer',
      round: 'Technical',
      scheduled_at: at(0, 9, 30),
      duration_minutes: 90,
      mode: 'online',
      meeting_link: 'https://meet.seta.io/iv-1042',
      panel: panel('Vo Thanh Dat', 'Tran Thu Ha'),
      note: 'Live incident-response scenario — share the design-system portfolio beforehand.',
      status: 'scheduled',
    },
    {
      id: 'int-03',
      candidate_id: 'cand-04',
      candidate_name: 'Vo Thi Kim Ngan',
      requisition_title: 'Business Analyst',
      round: 'Culture fit',
      scheduled_at: at(0, 15, 30),
      duration_minutes: 45,
      mode: 'online',
      meeting_link: 'https://meet.seta.io/iv-1043',
      panel: panel('Hoang Thi Lan'),
      note: 'Final round before offer.',
      status: 'scheduled',
    },
    {
      id: 'int-04',
      candidate_id: 'cand-03',
      candidate_name: 'Le Van Khanh',
      requisition_title: 'Go Backend Engineer',
      round: 'Technical',
      scheduled_at: at(1, 10, 0),
      duration_minutes: 60,
      mode: 'online',
      meeting_link: 'https://meet.seta.io/iv-1044',
      panel: panel('Pham Quoc Bao', 'Tran Thu Ha'),
      note: 'Concurrency live-coding task.',
      status: 'scheduled',
    },
    {
      id: 'int-05',
      candidate_id: 'cand-05',
      candidate_name: 'Do Minh Tri',
      requisition_title: 'QA Automation Engineer',
      round: 'Screening',
      scheduled_at: at(3, 9, 0),
      duration_minutes: 30,
      mode: 'online',
      meeting_link: 'https://meet.seta.io/iv-1045',
      panel: panel('Nguyen Anh Thai'),
      note: '',
      status: 'scheduled',
    },
    {
      id: 'int-06',
      candidate_id: 'cand-07',
      candidate_name: 'Pham Hong Son',
      requisition_title: 'Kafka Platform Engineer',
      round: 'Final',
      scheduled_at: at(8, 14, 0),
      duration_minutes: 60,
      mode: 'onsite',
      meeting_link: null,
      panel: panel('Nguyen Khanh Linh', 'Vo Thanh Dat'),
      note: 'Comp expectations came up in the technical round — read that feedback first.',
      status: 'scheduled',
    },
    {
      id: 'int-07',
      candidate_id: 'cand-09',
      candidate_name: 'Dang Thu Trang',
      requisition_title: 'Senior React Engineer',
      round: 'Final',
      scheduled_at: at(-5, 11, 0),
      duration_minutes: 60,
      mode: 'onsite',
      meeting_link: null,
      panel: panel('Pham Quoc Bao', 'Nguyen Khanh Linh'),
      note: 'Shipped design-system portfolio; strong culture signals.',
      status: 'completed',
      result: 'pass',
      rating: 5,
      recommendation: 'hire',
      feedback_note: 'Outstanding system-design round — recommend hire.',
    },
    {
      id: 'int-08',
      candidate_id: 'cand-06',
      candidate_name: 'Vu Hoang Yen',
      requisition_title: 'Senior ML Engineer',
      round: 'Technical',
      scheduled_at: at(-6, 15, 0),
      duration_minutes: 90,
      mode: 'online',
      meeting_link: 'https://meet.seta.io/iv-0988',
      panel: panel('Vo Thanh Dat'),
      note: 'Had productionized forecasting models with a model registry before.',
      status: 'completed',
      result: 'pass',
      rating: 4,
      recommendation: 'next_round',
      feedback_note: 'Strong MLOps depth; move to final round.',
    },
    {
      id: 'int-09',
      candidate_id: 'cand-02',
      candidate_name: 'Tran Dinh Phong',
      requisition_title: 'DevOps Engineer',
      round: 'Technical',
      scheduled_at: at(-3, 15, 0),
      duration_minutes: 90,
      mode: 'online',
      meeting_link: 'https://meet.seta.io/iv-0967',
      panel: panel('Vo Thanh Dat'),
      note: 'Good AWS breadth but shallow Kubernetes depth.',
      status: 'completed',
      result: 'fail',
      rating: 2,
      recommendation: 'no_hire',
      feedback_note: 'Struggled on the incident-response scenario — k8s depth insufficient.',
    },
    {
      id: 'int-10',
      candidate_id: 'cand-10',
      candidate_name: 'Bui Xuan Truong',
      requisition_title: 'Business Analyst',
      round: 'Screening',
      scheduled_at: at(-1, 9, 0),
      duration_minutes: 30,
      mode: 'online',
      meeting_link: 'https://meet.seta.io/iv-1011',
      panel: panel('Hoang Thi Lan'),
      note: '',
      status: 'cancelled',
      outcome_reason: 'Candidate accepted another offer before the round.',
    },
    {
      id: 'int-11',
      candidate_id: 'cand-11',
      candidate_name: 'Ly Cong Minh',
      requisition_title: 'QA Automation Engineer',
      round: 'Technical',
      scheduled_at: at(-4, 10, 0),
      duration_minutes: 60,
      mode: 'online',
      meeting_link: 'https://meet.seta.io/iv-0972',
      panel: panel('Nguyen Anh Thai'),
      note: '',
      status: 'no_show',
      outcome_reason: 'No response on the call; follow-up email sent.',
    },
  ];
}
