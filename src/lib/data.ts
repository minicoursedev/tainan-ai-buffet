import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import rawEvents from '../data/events.json';
import rawFriends from '../data/friends.json';
import rawSkills from '../data/skills.json';

const httpsUrl = z.url({ protocol: /^https$/ });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'must be a valid calendar date');
const dateTime = z.iso.datetime({ offset: true });

const eventSchema = z.object({
  date,
  datePending: z.boolean().optional(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  slides: z.string().regex(/^event\/\d{8}\/$/).nullable(),
  registration: httpsUrl.nullable(),
  status: z.enum(['past', 'upcoming']).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  endsAt: dateTime.optional(),
  heading: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
  location: z.string().optional(),
  participation: z.string().optional(),
  registrationLabel: z.string().optional(),
  topics: z.array(z.string()),
}).superRefine((event, context) => {
  if (!event.endsAt && !event.status) {
    context.addIssue({ code: 'custom', message: 'requires endsAt or status' });
  }
  if (event.paragraphs && (!event.startTime || !event.endTime || !event.location || !event.participation)) {
    context.addIssue({ code: 'custom', message: 'detailed events require time, location, and participation' });
  }
});

const friendSchema = z.object({
  organizer: z.string().trim().min(1),
  contact: z.string(),
  format: z.enum(['線上', '線下']),
  location: z.string(),
  locationNote: z.string(),
  url: httpsUrl,
  hours: z.string(),
  title: z.string().trim().min(1),
  description: z.string(),
  dates: z.array(z.string()).min(1),
  sortDate: dateTime,
  endsAt: dateTime.nullable(),
  note: z.string(),
});

const skillSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  example: z.string().trim().min(1),
  url: httpsUrl,
  origin: z.string().trim().min(1),
});

export const events = z.array(eventSchema).parse(rawEvents);
export const friends = z.array(friendSchema).parse(rawFriends);
export const skills = z.array(skillSchema).parse(rawSkills);

const dates = new Set<string>();
for (const event of events) {
  if (dates.has(event.date)) throw new Error(`Duplicate event date: ${event.date}`);
  dates.add(event.date);
  if (event.slides) {
    const slide = resolve(process.cwd(), 'public', event.slides, 'index.html');
    if (!existsSync(slide)) throw new Error(`Missing slides: ${event.slides}`);
  }
}

export type Event = z.infer<typeof eventSchema>;
export type Friend = z.infer<typeof friendSchema>;
export type Skill = z.infer<typeof skillSchema>;

export function isUpcoming(event: Event, now = Date.now()) {
  return event.endsAt ? Date.parse(event.endsAt) > now : event.status === 'upcoming';
}
