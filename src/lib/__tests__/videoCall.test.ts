import { describe, expect, it } from 'vitest';
import { videoLabel, videoPlatform, zoomMeetingId } from '../videoCall';

describe('videoCall', () => {
  it('tells Zoom and Google Meet links apart', () => {
    expect(videoPlatform('https://us05web.zoom.us/j/81234567890?pwd=abc')).toBe('zoom');
    expect(videoPlatform('https://zoom.us/j/81234567890')).toBe('zoom');
    expect(videoPlatform('https://meet.google.com/abc-defg-hij')).toBe('meet');
    expect(videoPlatform('https://evil.com/zoom.us/j/1')).toBe('none');
    expect(videoPlatform('')).toBe('none');
    expect(videoLabel('https://zoom.us/j/81234567890')).toBe('Zoom');
    expect(videoLabel('https://meet.google.com/abc-defg-hij')).toBe('Google Meet');
  });

  it('reads the Zoom meeting id from a join link', () => {
    expect(zoomMeetingId('https://us05web.zoom.us/j/81234567890?pwd=abc')).toBe('81234567890');
    expect(zoomMeetingId('https://meet.google.com/abc-defg-hij')).toBe('');
  });
});
