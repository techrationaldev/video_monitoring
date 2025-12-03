import { LocalStorageService, S3StorageService } from '../services/storageService';
import fs from 'fs';
import { Upload } from '@aws-sdk/lib-storage';

jest.mock('fs');
jest.mock('@aws-sdk/lib-storage');
jest.mock('@aws-sdk/client-s3');
jest.mock('../utils/logger');

describe('StorageService', () => {
    describe('LocalStorage', () => {
        it('should move file to destination', async () => {
            // Mock fs.promises.rename BEFORE creating the service or calling the method
            // In jest, fs.promises needs to be mocked specifically if it's not automatically handled by jest.mock('fs') correctly for nested properties in some versions/configs.
            // But usually jest.mock('fs') mocks the whole module.
            // The error "Cannot read properties of undefined (reading 'rename')" suggests fs.promises is undefined.
            // This is because node's fs module has promises as a property, but basic jest mock might not populate it unless we use a manual mock or __mocks__.

            // Let's rely on manual property definition for this test file context
            // @ts-ignore
            fs.promises = {
                rename: jest.fn().mockResolvedValue(undefined),
                unlink: jest.fn().mockResolvedValue(undefined),
            };

            const service = new LocalStorageService('recordings');
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            await service.uploadFile('/tmp/source.mp4', 'dest.mp4');

            expect(fs.promises.rename).toHaveBeenCalledWith(
                '/tmp/source.mp4',
                expect.stringContaining('recordings/dest.mp4')
            );
        });
    });

    describe('S3Storage', () => {
        beforeAll(() => {
            process.env.AWS_S3_BUCKET = 'test-bucket';
        });

        it('should upload file to S3', async () => {
             // @ts-ignore
             fs.promises = {
                rename: jest.fn().mockResolvedValue(undefined),
                unlink: jest.fn().mockResolvedValue(undefined),
            };

            const service = new S3StorageService();
            (Upload as unknown as jest.Mock).mockImplementation(() => ({
                done: jest.fn().mockResolvedValue({})
            }));
            (fs.createReadStream as jest.Mock).mockReturnValue('stream');

            const result = await service.uploadFile('/tmp/source.mp4', 'dest.mp4');

            expect(Upload).toHaveBeenCalled();
            expect(result).toBe('s3://test-bucket/dest.mp4');
            expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/source.mp4');
        });
    });
});
