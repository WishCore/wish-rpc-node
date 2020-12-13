import { Client } from '../src/rpc-client';
import { Server } from '../src/rpc-server';
import * as expect from 'expect';
import { Readable, Writable } from 'stream';

class Source extends Readable {
    waitDrain = false;

    constructor(opts) {
        super(opts);
    }
}

describe('RPC test', function () {

    let server: Server;
    let client: Client;
    let session: number;

    before(function (done) {
        server = new Server();
        server.insertMethods({
            _file: {},
            file: (req, res) => {
                res.send('world');
            },
        });

        session = server.open();

        /** Simulates a bidirectional connection between client and server */
        const connection = {
            write: (data) => {
                server.parse(
                    data,
                    (data) => {
                        client.messageReceived(data);
                    },
                    {},
                    session
                );
            }
        };

        client = new Client(connection.write);

        done();
    });

    it('should make a basic request', function (done) {
        client.request('file', ['hello'], function (err, data) {
            expect(data).toStrictEqual('world');
            done();
        });
    });

    it('should do something', async function () {
        this.timeout(5000);

        let length = 1 * 1024 * 1024;
        let end = false;
        const source = new Source({
            read(readSize: number) {
                if (this.waitDrain) {
                    this.waitDrain = false;
                    this.emit('continue');
                }
            }
        });

        const addReadableData = () => {
            if (end) { return; }

            const chunkSize = 32 * 1024;

            length -= chunkSize;

            if (length < 0) {
                end = true;
                source.push(null);
                return;
            }

            const more = source.push(Buffer.alloc(chunkSize, 0));

            if (more) {
                setTimeout(addReadableData, 0);
            } else {
                source.waitDrain = true;
            }
        };

        source.on('continue', () => {
            addReadableData();
        });

        setTimeout(addReadableData, 0);

        let writeReady;

        const destination = new Writable({
            write(chunk: Buffer, encoding, cb) {
                if (writeReady) {
                    console.log('writeReady was not cleared... kaboom!');
                    return;
                }

                writeReady = cb;
            }
        });

        const writeInterval = setInterval(() => {
            if (writeReady) {
                setTimeout(writeReady, 0);
                writeReady = null;
            }
        }, 10);

        source.pipe(destination);

        await new Promise(resolve => {
            source.on('end', resolve);
        });

        // clearInterval(interval);
        clearInterval(writeInterval);
    });
});