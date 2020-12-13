
export interface MethodMap {
    [endpoint: string]: any
}

export interface RequestMessage {
    op: string;
    args?: any[];
    id?: number;
    push?: number;
    sig?: number;
    data?: any;
    end?: number;
    stream?: any
}

export interface ResponseMessage {
    ack?: number;
    err?: number;
    sig?: number;
    end?: number;
    push?: number;
    data?: any;
}

export interface RequestMap {
    [clientId: string]: {
        [requestId: string]: any
    }
}

export * from './rpc-client';
export * from './rpc-server';
