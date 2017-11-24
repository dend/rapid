'use strict';

import * as vscode from 'vscode';
import { TextDocumentContentProvider, workspace, commands } from 'vscode';
import * as path from 'path';
import fileUrl = require('file-url');
import { request } from 'http';

let superagent = require('superagent');
let xpath = require('xpath');
let dom = require('xmldom').DOMParser;
let htmlEncode = require('js-htmlencode');

const apiBrowserEndpoint = `https://docs.microsoft.com/api/apibrowser/API_PLATFORM_V6G/search?api-version=0.2&search=`;

export function createStaticFileUri(file: string): string {
    return fileUrl(
        path.join(
            __dirname,
            // "..",
            "..",
            "static",
            file
        )
    );
}

const rawPrefixHtml = `<html>
                        <head>
                            <!-- Global site tag (gtag.js) - Google Analytics -->
                            <script async src="https://www.googletagmanager.com/gtag/js?id=UA-110079169-1"></script>
                            <script>
                            window.dataLayer = window.dataLayer || [];
                            function gtag(){dataLayer.push(arguments);}
                            gtag('js', new Date());
                            
                            gtag('config', 'UA-110079169-1');
                            </script>
                        
                            <meta charset="utf-8" />
                            <title>Rapid API Search</title>
                            <link rel = "stylesheet"
                            href = "${createStaticFileUri("css/icon.css")}">
                            <link rel = "stylesheet"
                                href = "${createStaticFileUri("css/materialize.min.css")}">
                            <script type = "text/javascript"
                                src = "${createStaticFileUri("js/jquery-2.1.1.min.js")}"></script>           
                            <script src = "${createStaticFileUri("js/materialize.min.js")}">
                            </script>   
                            <meta name="viewport" content="width=device-width, initial-scale=1">
                        </head>
                        <body>`;

const rawSuffixHtml = `<br/><p>Made with ❤ in Vancouver, BC, Canada, by <a href="https://twitter.com/DennisCode">Den Delimarsky</a>.</p><br/>
                        </body>
                       </html>`;

const xPathSignatureLookup = `(//*[local-name()='code' and contains(@class,'lang-API_LANG_V6G')])[1]`;
const xPathExampleLookup = `//*[.='Examples']/following-sibling::pre/code[contains(@class,'lang-API_LANG_V6G')]`;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    let apiPreviewUri = vscode.Uri.parse('rapid://authority/rapid');

    class ApiTextDocumentContentProvider implements TextDocumentContentProvider {
        showApiResults(content: string) {
            return content;
        }

        // Gets API information, including the signature and the first example.
        async getApiSignature(apiUrl: string,lang:string): Promise<Object> {
            let response = await superagent.get(apiUrl);
            let textResponse = response["text"];

            let signatureLookup = xPathSignatureLookup.replace('API_LANG_V6G',lang);
            let exampleLookup = xPathExampleLookup.replace('API_LANG_V6G',lang);

            // The XPath changes ever so slightly when we have a fragment, because that means we have an
            // ID to key off of.
            if (apiUrl.includes("#")) {
                let fragment = apiUrl.substring(apiUrl.indexOf("#")+1);
                signatureLookup = `//*[@id='${fragment}']/ancestor::div[1]//pre[1]/code[contains(@class,'lang-${lang}')]`
                exampleLookup = `//*[@id='${fragment}']/ancestor::div[1]//*[.='Examples']/following-sibling::pre/code[contains(@class,'lang-${lang}')]`;
            }

            // In some cases, pages are wrapped in a div that throws off the lookup,
            // so it's best to just remove it.
            let regex = /<div class=\"memberNameHolder\">(.|\n|\r)+?<\/div>/g;

            do {
                var t = regex.exec(textResponse);
                if (t) {
                    let enhancedGarbageWrapper = t[0].replace('<div class="memberNameHolder">','').replace('</div>','');
                    textResponse = textResponse.replace(t[0],enhancedGarbageWrapper);
                }
            } while (t);
           

            let content : any = new Object();
            let doc = new dom().parseFromString(textResponse);
            
            let sigNodes = xpath.select(signatureLookup, doc);
            let sampleNodes = xpath.select(exampleLookup,doc);

            // Make sure to use proper substitutes in case where we need
            // to tell the user that no content was found.
            // It's also important to HTML-encode things here, as sometimes
            // (esp. in cases like PowerShell), code contains characters
            // that can be rendered as HTML.
            if (sigNodes[0]) {
                content.signature = htmlEncode(sigNodes[0].textContent);
            }
            else {
                content.signature = "No signature available."
            }

            if (sampleNodes[0]) {
                content.example = htmlEncode(sampleNodes[0].textContent);
            }
            else {
                content.example = "No example available."
            }

            return content;
        }

        // Performs an API search based on the term currently selected in
        // the editor.
        async performApiSearch(): Promise<string> {
            let editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            let selection = editor.selection;
            let text = editor.document.getText(selection);
            let requestLocation = apiBrowserEndpoint;

            // This will determine what API Browser endpoint we will be checking
            // to get API information.
            if (editor.document.languageId === 'csharp' || editor.document.languageId === 'vb') {
                requestLocation = requestLocation.replace('API_PLATFORM_V6G','dotnet');    
            } else {
                requestLocation = requestLocation.replace('API_PLATFORM_V6G','powershell');
            }

            // No text was selected, so we might as well not do a lookup.
            if (!text) {
                return "NO_SELECTION";
            }
            else {
                console.log(text);
            }

            let response = await superagent.get(requestLocation + text);

            return response["text"];
        }

        private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

        get onDidChange(): vscode.Event<vscode.Uri> {
            return this._onDidChange.event;
        }

        public update(uri: vscode.Uri) {
            this._onDidChange.fire(uri);
        }

        async processData(data: string, docLang: string): Promise<string> {
            let self = this;

            let parsedJson = JSON.parse(data);

            let combinedHtml = `<div style="width:230px; margin:0 auto;">
                                    <img src="${createStaticFileUri("images/ghost.png")}" style="max-width: 210px; text-align: center;" />
                                    <h2 style="text-align: center;">Uh oh...</h2>
                                    <p style="text-align: center;">Looks like we don't know what this API is.</p>
                                    <p style="text-align: center;"><a style="color: #AED6F1;" href="https://twitter.com/DennisCode">Let Den know</a> about this.</p>
                                </div>`;

            if (parsedJson.count > 0) {
                console.log("There are items to work with!");

                combinedHtml = rawPrefixHtml;

                if (parsedJson.results.length > 5) {
                    parsedJson.results = parsedJson.results.slice(0, 5);
                }

                for (let i = 0, len = parsedJson.results.length; i < len; i++) {
                    let stringFunction = function guid() {
                        function s4() {
                            return Math.floor((1 + Math.random()) * 0x10000)
                                .toString(16)
                                .substring(1);
                        }
                        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                            s4() + '-' + s4() + s4() + s4();
                    }

                    let randomString = stringFunction();
                    let apiData = null;

                    await this.getApiSignature(parsedJson.results[i].url, docLang).then((data) => {
                        apiData = data;
                    });

                    combinedHtml += ` <div class="card">
                                        <div class="card-content">
                                        <h4 style="color:black;">${parsedJson.results[i].displayName.replace(/\./g, '.<wbr>')}</h4>
                                        <p>${parsedJson.results[i].itemKind.toUpperCase()}</p><br/>
                                        <p style="color:black;">${parsedJson.results[i].description != null ? parsedJson.results[i].description : 'No description available.'}</p><br/>
                                        <p><a href="${parsedJson.results[i].url}">See on docs.microsoft.com...</a></p>
                                        </div>
                                        <div class="card-tabs">
                                        <ul class="tabs tabs-fixed-width">
                                            <li class="tab"><a class="active" href="#test-1-${randomString}">Signature</a></li>
                                            <li class="tab"><a href="#test-3-${randomString}">Sample</a></li>
                                        </ul>
                                        </div>
                                        <div class="card-content grey lighten-4">
                                        <div style="color:black;" id="test-1-${randomString}"><pre>${apiData.signature}</pre></div>
                                        <div style="color:black;" id="test-3-${randomString}"><pre>${apiData.example}</pre></div>
                                        </div>
                                    </div>`;
                }

                combinedHtml += rawSuffixHtml;
            }

            return combinedHtml;
        }

        public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
            let self = this;
            let editor = vscode.window.activeTextEditor;

            return await this.performApiSearch().then((data) => {
                if (data === "NO_SELECTION"){
                    return `<div style="width:230px; margin:0 auto;">
                                <img src="${createStaticFileUri("images/ghost.png")}" style="max-width: 210px; text-align: center;" />
                                <h2 style="text-align: center;">One second there...</h2>
                                <p style="text-align: center;">Looks like you didn't really have anything to lookup.</p>
                                <p style="text-align: center;"><a style="color: #AED6F1;" href="https://twitter.com/DennisCode">Let Den know</a> about this (but he'll tell you the same thing we just did).</p>
                            </div>`;
                } else {
                    if (editor.document.languageId === 'csharp') {
                        return self.processData(data, "csharp");
                    } else if (editor.document.languageId === 'vb'){
                        return self.processData(data, "vb");
                    }  else if (editor.document.languageId === 'powershell'){
                        return self.processData(data, "powershell");
                    }else {
                        return `<div style="width:230px; margin:0 auto;">
                                    <img src="${createStaticFileUri("images/ghost.png")}" style="max-width: 210px; text-align: center;" />
                                    <h2 style="text-align: center;">Yikes...</h2>
                                    <p style="text-align: center;">Looks like we don't support this language yet.</p>
                                    <p style="text-align: center;"><a style="color: #AED6F1;" href="https://twitter.com/DennisCode">Let Den know</a> about this.</p>
                                </div>`;
                    }
                }
            }).catch((exception) => {
                console.log(exception)
                return  `<div style="width:230px; margin:0 auto;">
                            <img src="${createStaticFileUri("images/ghost.png")}" style="max-width: 210px; text-align: center;" />
                            <h2 style="text-align: center;">Ah snap.</h2>
                            <p style="text-align: center;">Something went wrong. According to our ghost, here is what went down: ${exception}</p>
                            <p style="text-align: center;"><a style="color: #AED6F1;" href="https://twitter.com/DennisCode">Let Den know</a> about this.</p>
                        </div>`;
            });
        }

    }

    let provider = new ApiTextDocumentContentProvider();
    let registration = workspace.registerTextDocumentContentProvider('rapid', provider);

    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.lookupApi', () => {
        return commands.executeCommand('vscode.previewHtml', apiPreviewUri, vscode.ViewColumn.Two, 'Rapid API Search').then((success) => {
        }, (reason) => {
            vscode.window.showErrorMessage(reason);
        });
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}