import * as vscode from "vscode";
import { RouteParam } from "../../../utils";
import { QixFsFileAdapter } from "../entry";
import YAML from "yaml";

export class VariableFile extends QixFsFileAdapter {

    private qlikVarTpl = {
        qName: "",
        qDefinition: "",
        qInfo: {
            qId: "",
            qType: "variable",
        },
        qComment: "",
        qIncludeInBookmark: false
    };

    /**
     * read variable data
     */
    public async readFile(uri: vscode.Uri, params: RouteParam): Promise<Uint8Array> {
        const connection = await this.getConnection(uri);
        const app        = await connection.open(params.app);
        const varName    = this.sanitizeName(params.variable);
        const variable   = await this.getVariable(app, varName);

        if (variable) {
            const properties = await variable.getProperties();
            return Buffer.from(YAML.stringify({
                qDefinition: properties?.qDefinition ?? "",
                qComment: properties?.qComment ?? "",
                qNumberPresentation: properties?.qNumberPresentation,
                qIncludeInBookmark: properties?.qIncludeInBookmark ?? false
            }, 4));
        }
        return Buffer.from("Error");
    }

    public async rename(uri: vscode.Uri, name: string, params: RouteParam): Promise<void> {

        const connection = await this.getConnection(uri);
        const app        = await connection.open(params.app);
        const varName    = this.sanitizeName(params.variable);
        const variable   = await this.getVariable(app, varName);

        if (variable) {
            await this.updateVariable(variable, {qName: this.sanitizeName(name)});
            await app.doSave();
        }
    }

    /**
     * get stats of variable for vscode file system
     */
    public async stat(uri: vscode.Uri, params: RouteParam): Promise<vscode.FileStat | void> {
        const connection = await this.getConnection(uri);
        const app        = await connection.open(params.app);
        const varName    = this.sanitizeName(params.variable);
        const variable   = await this.getVariable(app, varName);

        if (variable) {
            return {
                ctime: Date.now(),
                mtime: Date.now(),
                size: 1,
                type: vscode.FileType.File,
            }
        }
    }

    /**
     * write file, update or create a new variable
     */
    public async writeFile(uri: vscode.Uri, content: Uint8Array, params: RouteParam): Promise<void> {

        const connection = await this.getConnection(uri);
        const app        = await connection.open(params.app);
        const varName    = this.sanitizeName(params.variable);
        const variable   = await this.getVariable(app, varName);

        variable 
            ? await this.updateVariable(variable, content)
            : await this.createVariable(app, varName, content.length ? content.toString() : void 0);

        await app.doSave();
    }

    /** 
     * get name of variable
     */
    private sanitizeName(value: string = ""): string {
        return /(.*?)(\.\w+)?$/g.test(value) ? RegExp.$1 : value;
    }

    /**
     * checks if a variable exists if this is not 
     */
    private async getVariable(app: EngineAPI.IApp, name: string): Promise<EngineAPI.IGenericVariable | undefined> {
        try {
            return await app.getVariableByName(name);
        } catch (error) {
            return void 0;
        }
    }

    /**
     * create new variable if not exists
     */
    private async createVariable(app: EngineAPI.IApp, name: string,content?: string): Promise<void> {
        const varContent = content ? YAML.parse(content) : {};
        await app.createVariableEx(Object.assign({}, this.qlikVarTpl, varContent, {qName: name}));
    }

    /**
     * update existing variable
     */
    private async updateVariable(variable: EngineAPI.IGenericVariable, content: Uint8Array | {[key: string]: any}) {
        const data: {[key: string]: any} = content instanceof Uint8Array ? YAML.parse(content.toString()) : content;
        const patches = Object.keys(data).map<EngineAPI.INxPatch>((property) => {
            return {
                qOp   : "Replace",
                qPath : `/${property}`,
                qValue: `${JSON.stringify(data[property], null, 4)}`
            }
        });
        await variable.applyPatches(patches);
    }
}
