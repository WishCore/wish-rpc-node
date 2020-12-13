import { Client } from '../src/rpc-client';
import { Server } from '../src/rpc-server';
import * as expect from 'expect';
import { Readable, ReadableOptions, Writable } from 'stream';

class Source extends Readable {
    waitDrain = false;

    constructor(opts?: ReadableOptions) {
        super({
            read: (size: number) => {
                if (this.waitDrain) {
                    this.waitDrain = false;
                    this.emit('continue');
                }

                if (opts && opts.read) {
                    opts.read.bind(this)(size);
                }
            }
        });
    }
}

class ZeroSource extends Source {
    constructor(private length: number) {
        super();

        const chunk = 60 * 1024;
        let end = false;

        const addReadableData = () => {
            if (end) { return; }

            length -= chunk;

            if (length <= 0) {
                end = true;
                this.push(null);
                return;
            }

            const more = this.push(Buffer.alloc(chunk, 0));

            if (more) {
                setTimeout(addReadableData, 0);
            } else {
                this.waitDrain = true;
            }
        };

        this.on('continue', () => {
            addReadableData();
        });

        setTimeout(addReadableData, 0);
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
                // console.log('about to send to rpc.parse:', data);
                server.parse(
                    data,
                    (data) => {
                        // console.log('client received message:', data);
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

    it('should pipe 10 MiB', async function () {
        const length = 10 * 1024 * 1024;
        const source = new ZeroSource(length);

        const destination = new Writable({
            write(chunk: Buffer, encoding, cb) {
                cb();
            }
        });

        source.pipe(destination);

        await new Promise(resolve => {
            source.on('end', resolve);
        });
    });

    it('should test backpressure (using read on readable)', async function () {
        const length = 256 * 1024;
        const source = new ZeroSource(length);

        source.on('readable', async () => {
            for(;;) {
                const chunk = source.read(8 * 1024);

                if (chunk === null) {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 5));
            }
        });

        await new Promise(resolve => {
            source.on('end', resolve);
        });
    });


    it('should test backpressure (Writable with limited write speed)', async function () {
        this.timeout(5000);
        const length = 256 * 1024;
        const source = new ZeroSource(length);

        let writeCb: (error?: Error) => void;

        const destination = new Writable({
            write(chunk: Buffer, encoding, cb) {
                writeCb = cb;
                setTimeout(() => { writeCb(); }, 5);
            }
        });

        source.pipe(destination);

        await new Promise(resolve => {
            source.on('end', resolve);
        });
    });
});