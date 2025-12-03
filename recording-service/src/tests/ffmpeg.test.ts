import { FFmpegRecorder } from '../services/ffmpegRecorder';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';

jest.mock('fluent-ffmpeg');
jest.mock('fs');
jest.mock('../utils/logger');

describe('FFmpegRecorder', () => {
    let recorder: FFmpegRecorder;
    let mockCommand: any;

    beforeEach(() => {
        jest.clearAllMocks();
        recorder = new FFmpegRecorder();

        mockCommand = {
            input: jest.fn().mockReturnThis(),
            inputOptions: jest.fn().mockReturnThis(),
            outputOptions: jest.fn().mockReturnThis(),
            output: jest.fn().mockReturnThis(),
            on: jest.fn().mockImplementation((event, callback) => {
                if (event === 'start') {
                   // callback('ffmpeg command line');
                }
                return mockCommand;
            }),
            run: jest.fn(),
            kill: jest.fn(),
        };

        (ffmpeg as unknown as jest.Mock).mockReturnValue(mockCommand);
    });

    it('should configure ffmpeg correctly', async () => {
        const promise = recorder.start({
            roomId: 'test',
            sdp: 'sdp-content',
            outputPath: 'output.mp4'
        });

        // Trigger start event manually
        const startCallback = mockCommand.on.mock.calls.find((call: any[]) => call[0] === 'start')[1];
        startCallback('ffmpeg command');

        await promise;

        expect(ffmpeg).toHaveBeenCalled();
        expect(mockCommand.input).toHaveBeenCalledWith(expect.stringContaining('test.sdp'));
        expect(mockCommand.run).toHaveBeenCalled();
    });
});
