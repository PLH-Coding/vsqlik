import { AuthStrategy, Connection } from "../../api";
import { AuthorizationStrategy, AuthorizationStrategyConstructor } from "./strategies/authorization.strategy";

declare type IteratorResult = [AuthorizationStrategy, (data: any) => any];

export class AuthorizationService {

    /**
     * instance of Authorization Service
     */
    private static instance: AuthorizationService = new AuthorizationService();

    /**
     * all authorization processes runs into an queue
     */
    private authorizationQueueItems: Map<AuthorizationStrategy, (data: any) => any>;

    /**
     * indicator a authorization process is currently running
     */
    private authorizationProcessIsRunning: boolean;

    private constructor() {
        if (AuthorizationService.instance) {
            throw new Error("Use AuthorizationService.getInstance instead");
        }

        this.authorizationQueueItems = new Map();
        this.authorizationProcessIsRunning = false;
    }

    /**
     * get instance of authorization service
     */
    public static getInstance() {
        return this.instance;
    }

    /**
     * run authorization strategy in queue
     */
    public async authorize(connection: Connection): Promise<any> {

        const Strategy = await this.resolveStrategy(connection.authorization.strategy);
        const instance = new Strategy(connection);

        return new Promise((resolve) => {
            this.authorizationQueueItems.set(instance, (data: any) => resolve(data));

            if (!this.authorizationProcessIsRunning) {
                this.runAuthorization();
            }
        });
    }

    private async resolveStrategy(strategy: AuthStrategy): Promise<AuthorizationStrategyConstructor> {
        let resolvedStrat: unknown;
        switch (strategy) {
            case AuthStrategy.CERTIFICATE: {
                break;
            }
            default: {
                resolvedStrat = await (await import("./strategies/form-authorization.strategy")).default;
            }
        }
        return resolvedStrat as AuthorizationStrategyConstructor;
    }

    /**
     * runs authorization
     */
    private async runAuthorization() {

        this.authorizationProcessIsRunning = true;

        const entries = this.authorizationQueueItems.entries();
        let entry     = entries.next();

        while (!entry.done) {

            const [strategy, callback] = entry.value;
            await strategy.run();

            callback(strategy.sessionCookies);
            this.authorizationQueueItems.delete(strategy);

            /** grab next entry */
            entry = entries.next();
        }

        this.authorizationProcessIsRunning = false;
    }
}
