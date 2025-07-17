const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

let conversationHistory = [];
let activeSystemPrompt = '';

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // Load default prompt on activation
    try {
        const defaultPromptPath = path.join(context.extensionPath, 'prompts', 'prompt-assistant.md');
        activeSystemPrompt = fs.readFileSync(defaultPromptPath, 'utf-8');
    } catch (error) {
        activeSystemPrompt = 'You are a helpful assistant. Respond in Korean.';
        vscode.window.showWarningMessage('Default prompt file (prompt-assistant.md) not found. Using a fallback prompt.');
    }

    let selectPromptDisposable = vscode.commands.registerCommand('ai-prompt-writer.selectPrompt', async () => {
        const promptsPath = path.join(context.extensionPath, 'prompts');
        try {
            const promptFiles = fs.readdirSync(promptsPath).filter(file => file.endsWith('.md')); // Read .md files
            if (promptFiles.length === 0) {
                return vscode.window.showInformationMessage('No prompt files (.md) found in the prompts directory.');
            }

            const selectedFile = await vscode.window.showQuickPick(promptFiles, {
                placeHolder: 'Select a persona prompt for the AI',
            });

            if (selectedFile) {
                const filePath = path.join(promptsPath, selectedFile);
                activeSystemPrompt = fs.readFileSync(filePath, 'utf-8');
                vscode.window.showInformationMessage(`AI Persona set to: ${selectedFile}`);
            }
        } catch (error) {
            return vscode.window.showErrorMessage('Could not read prompts directory: ' + error.message);
        }
    });
    context.subscriptions.push(selectPromptDisposable);

    let startDisposable = vscode.commands.registerCommand('ai-prompt-writer.start', () => {
        const panel = vscode.window.createWebviewPanel(
            'aiPromptWriter',
            'AI Prompt Writer',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, ''))]
            }
        );

        panel.webview.html = getWebviewContent(context, panel.webview);

        const apiKey = vscode.workspace.getConfiguration('ai-prompt-writer').get('apiKey');
        if (!apiKey) {
            vscode.window.showErrorMessage('Anthropic API key not found. Please set it in the settings.');
            return;
        }

        const anthropic = new Anthropic({ apiKey });
        conversationHistory = []; // Start a new conversation

        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'sendMessage':
                        const userMessage = message.text;
                        conversationHistory.push({ role: 'user', content: userMessage });

                        if (userMessage.toLowerCase() === '저장해줘!') {
                            saveConversation(panel.webview);
                            return;
                        }

                        try {
                            if (activeSystemPrompt && activeSystemPrompt.includes('<case1>') && activeSystemPrompt.includes('<case2>')) {
                                const case1Content = activeSystemPrompt.split('<case1>')[1].split('</case1>')[0];
                                const case2Content = activeSystemPrompt.split('<case2>')[1].split('</case2>')[0];

                                const systemPrompt1 = case1Content.split('<explain>')[1].split('</explain>')[0].trim();
                                const systemPrompt2 = case2Content.split('<explain>')[1].split('</explain>')[0].trim();

                                const tempHistory = [...conversationHistory];

                                const [response1, response2] = await Promise.all([
                                    anthropic.messages.create({
                                        model: "claude-3-opus-20240229",
                                        max_tokens: 1024,
                                        system: systemPrompt1,
                                        messages: tempHistory.filter(m => m.role !== 'assistant' || m.content !== '저장되었습니다.')
                                    }),
                                    anthropic.messages.create({
                                        model: "claude-3-opus-20240229",
                                        max_tokens: 1024,
                                        system: systemPrompt2,
                                        messages: tempHistory.filter(m => m.role !== 'assistant' || m.content !== '저장되었습니다.')
                                    })
                                ]);

                                const aiResponse = `### 🍀 긍정적 사고 (원영적 사고)\n${response1.content[0].text}\n\n---\n\n### 😶‍🌫️ 현실적 사고 (정민적 사고)\n${response2.content[0].text}`;

                                conversationHistory.push({ role: 'assistant', content: aiResponse });

                                panel.webview.postMessage({
                                    command: 'addResponse',
                                    text: aiResponse
                                });

                            } else {
                                const msg = await anthropic.messages.create({
                                    model: "claude-3-opus-20240229",
                                    max_tokens: 1024,
                                    system: activeSystemPrompt,
                                    messages: conversationHistory.filter(m => m.role !== 'assistant' || m.content !== '저장되었습니다.')
                                });
    
                                const aiResponse = msg.content[0].text;
                                conversationHistory.push({ role: 'assistant', content: aiResponse });
    
                                panel.webview.postMessage({
                                    command: 'addResponse',
                                    text: aiResponse
                                });
                            }
                        } catch (error) {
                            vscode.window.showErrorMessage('Error calling Anthropic API: ' + error.message);
                            panel.webview.postMessage({
                                command: 'addResponse',
                                text: 'Error calling Anthropic API: ' + error.message
                            });
                        }
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(startDisposable);
}

function saveConversation(webview) {
    if (vscode.workspace.workspaceFolders) {
        const folderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        let content = '# AI Prompt Log\n\n';
        conversationHistory.forEach(turn => {
            content += `## ${turn.role === 'user' ? 'User' : 'AI'}\n\n${turn.content}\n\n`;
        });
        const filePath = path.join(folderPath, 'prompt-log.md');
        try {
            fs.writeFileSync(filePath, content);
            webview.postMessage({ command: 'addResponse', text: '저장되었습니다.' });
            conversationHistory.push({ role: 'assistant', content: '저장되었습니다.' });
        } catch (error) {
            vscode.window.showErrorMessage('Failed to save conversation: ' + error.message);
        }
    } else {
        vscode.window.showErrorMessage('No workspace open. Cannot save conversation.');
    }
}

function getWebviewContent(context, webview) {
    const mainjsUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'main.js')));
    const stylesUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'styles.css')));
    const htmlPath = path.join(context.extensionPath, 'webview.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    htmlContent = htmlContent.replace('{{main.js}}', mainjsUri.toString());
    htmlContent = htmlContent.replace('{{styles.css}}', stylesUri.toString());

    return htmlContent;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
