import { RecordingManager } from '../services/recordingManager';
import { FFmpegRecorder } from '../services/ffmpegRecorder';
import { MediasoupConnector } from '../services/mediasoupConnector';
import { LaravelNotifier } from '../services/notifyLaravel';
import { IStorageService } from '../services/storageService';
import { getFreeUdpPort } from '../utils/portFinder';
import fs from 'fs';

// Mock dependencies
jest.mock('../services/ffmpegRecorder');
jest.mock('../services/mediasoupConnector');
jest.mock('../services/notifyLaravel');
jest.mock('../services/storageService');
jest.mock('../utils/portFinder');
jest.mock('fs');
jest.mock('../utils/logger'); // Silence logs during tests

describe('RecordingManager', () => {
  let recordingManager: RecordingManager;
  let mockRecorder: jest.Mocked<FFmpegRecorder>;
  let mockMediasoup: jest.Mocked<MediasoupConnector>;
  let mockNotifier: jest.Mocked<LaravelNotifier>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup return values
    (MediasoupConnector as jest.Mock).mockImplementation(() => ({
      startRecordingTransport: jest.fn().mockResolvedValue({ sdp: 'mock-sdp', transportId: 't1' }),
      stopRecordingTransport: jest.fn().mockResolvedValue(undefined),
    }));

    (getFreeUdpPort as jest.Mock).mockResolvedValue(1234);

    (FFmpegRecorder as jest.Mock).mockImplementation(() => ({
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
    }));

    (LaravelNotifier as jest.Mock).mockImplementation(() => ({
        notifyRecordingComplete: jest.fn().mockResolvedValue(undefined),
        notifyRecordingFailed: jest.fn().mockResolvedValue(undefined),
    }));

    // Mock fs.existsSync to return true for dir checks
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });

    recordingManager = new RecordingManager();
    // Mock getStorageService to return a mock object with uploadFile
    // We cannot easily mock the standalone function getStorageService from here without extra setup
    // so we will mock the property on the instance if possible or mock the module.
    // However, since we mock 'storageService', let's mock the exported function.

    // But since `recordingManager` is instantiated inside the test but `getStorageService` is called in constructor,
    // we need to make sure the mock is set up before instantiation.
    // The issue in the failed test is that `this.storageService.uploadFile` is undefined.
    // This is because we mocked `../services/storageService` but didn't provide an implementation for `getStorageService` or the class instances.

    const mockStorageService = {
        uploadFile: jest.fn().mockResolvedValue('s3://bucket/file.mp4'),
    };
    (recordingManager as any).storageService = mockStorageService;

    // Access mocked instances
    mockMediasoup = (recordingManager as any).mediasoupConnector;
    mockNotifier = (recordingManager as any).notifier;
  });

  it('should start recording successfully', async () => {
    const roomId = 'test-room';
    await recordingManager.startRecording(roomId);

    expect(getFreeUdpPort).toHaveBeenCalledTimes(2);
    expect(mockMediasoup.startRecordingTransport).toHaveBeenCalledWith(roomId, '127.0.0.1', 1234, 1234);
    expect(recordingManager.getRecordingStatus(roomId).status).toBe('recording');
  });

  it('should throw error if recording already active', async () => {
    const roomId = 'test-room';
    await recordingManager.startRecording(roomId);

    await expect(recordingManager.startRecording(roomId)).rejects.toThrow(`Recording already active for room ${roomId}`);
  });

  it('should stop recording and notify laravel', async () => {
    const roomId = 'test-room';
    await recordingManager.startRecording(roomId);
    await recordingManager.stopRecording(roomId);

    expect(mockMediasoup.stopRecordingTransport).toHaveBeenCalledWith(roomId);
    expect(mockNotifier.notifyRecordingComplete).toHaveBeenCalled();
    expect(recordingManager.getRecordingStatus(roomId).status).toBe('idle');
  });
});
