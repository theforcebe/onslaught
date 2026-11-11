import {it,expect} from 'vitest';
import {calendarFile} from '../src/lib/calendar';
it('exports UTC event times and escapes injected iCalendar content',()=>{const file=calendarFile({id:'test',title:'Raid\nBEGIN:VEVENT',instance:'Place, name',teamId:'vanguard',start:'2026-11-14T03:00:00Z',end:'2026-11-14T06:00:00Z',timeZone:'America/Los_Angeles',notes:'One; two',signups:{}});expect(file).toContain('DTSTART:20261114T030000Z');expect(file).toContain('SUMMARY:Raid\\nBEGIN:VEVENT');expect(file).toContain('LOCATION:Place\\, name');expect(file.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1);});
