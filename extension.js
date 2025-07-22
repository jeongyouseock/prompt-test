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

        // 웹뷰 로드 시 첫 환영 메시지 전송
        setTimeout(() => {
            panel.webview.postMessage({
                command: 'addResponse',
                text: '🤖 AI 프롬프트 작성 도우미 AI(WatchCode) 입니다. 🤖'
            });
        }, 1000);

        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'sendMessage':
                        try {
                            const { text, section, prompts } = message;

                            // AI에게 보낼 메시지 구성
                            const userMessageForAPI = {
                                userMsg: text,
                                changeTarget: section, // 사용자가 선택한 섹션 ID 추가
                                prompt: prompts
                            };

                            // 대화 기록에 사용자 메시지 추가 (단순 텍스트로)
                            conversationHistory.push({ role: 'user', content: text });

                            const apiParams = {
                                model: "claude-3-opus-20240229",
                                max_tokens: 2048, // JSON 응답이 길 수 있으므로 토큰 수 증가
                                system: activeSystemPrompt,
                                messages: [
                                    ...conversationHistory.filter(m => m.role !== 'assistant' || !m.content.startsWith('{')),
                                    { role: 'user', content: JSON.stringify(userMessageForAPI) }
                                ]
                            };

                            console.log('--- API Request ---');
                            console.log(JSON.stringify(apiParams, null, 2));

                            const msg = await anthropic.messages.create(apiParams);
                            const aiResponseRaw = msg.content[0].text;

                            console.log('--- API Response ---');
                            console.log(aiResponseRaw);

                            // AI 응답을 JSON으로 파싱
                            const aiResponseJson = JSON.parse(aiResponseRaw);

                            // 대화 기록에 AI 응답 추가 (JSON 문자열로)
                            conversationHistory.push({ role: 'assistant', content: aiResponseRaw });

                            // 웹뷰로 프롬프트 업데이트 명령 전송
                            panel.webview.postMessage({
                                command: 'updatePrompts',
                                response: aiResponseJson.response, // AI의 채팅 메시지
                                prompts: aiResponseJson.prompt // 업데이트된 프롬프트 데이터
                            });

                        } catch (error) {
                            console.error('Error processing message:', error);
                            vscode.window.showErrorMessage('Error processing message: ' + error.message);
                            panel.webview.postMessage({
                                command: 'addResponse',
                                text: '오류가 발생했습니다: ' + error.message
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
