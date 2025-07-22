(function () {
    const vscode = acquireVsCodeApi();

    const messages = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');

    const promptSections = document.querySelectorAll('.prompt-section');
    let activeSectionId = null;

    // 항상 하나의 섹션이 선택되도록 클릭 로직을 수정합니다.
    function initialize() {
        // 모든 프롬프트 섹션에 클릭 이벤트 리스너 추가
        promptSections.forEach(section => {
            section.addEventListener('click', () => {
                // 모든 섹션에서 'active-section' 클래스 제거
                promptSections.forEach(s => s.classList.remove('active-section'));

                // 클릭된 섹션에만 'active-section' 클래스 추가
                section.classList.add('active-section');
                activeSectionId = section.querySelector('textarea').id;
            });
        });

        // 페이지 로드 시 첫 번째 섹션('역할')을 기본으로 활성화
        if (promptSections.length > 0) {
            const firstSection = promptSections[0];
            firstSection.classList.add('active-section');
            activeSectionId = firstSection.querySelector('textarea').id;
        }
    }

    initialize();

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

    function sendMessage() {
        const text = messageInput.value;
        if (text.trim() === '') return;

        // 현재 모든 프롬프트 섹션의 값을 가져옵니다.
        const currentPrompts = {};
        promptSections.forEach(section => {
            const textarea = section.querySelector('textarea');
            currentPrompts[textarea.id] = textarea.value;
        });

        addMessage(text, 'user');
        vscode.postMessage({
            command: 'sendMessage',
            text: text,
            section: activeSectionId, // 활성화된 섹션 ID
            prompts: currentPrompts // 모든 프롬프트의 현재 값
        });

        messageInput.value = '';

        // 메시지 전송 후 활성 상태는 유지합니다. (요구사항 변경으로 초기화 코드 제거)
    }

    window.addEventListener('message', event => {
        const message = event.data; 
        switch (message.command) {
            case 'addResponse':
                addMessage(message.text, 'ai');
                break;
            case 'updatePrompts':
                const prompts = message.prompts;
                for (const id in prompts) {
                    const textarea = document.getElementById(id);
                    if (textarea) {
                        textarea.value = prompts[id];
                    }
                }
                // AI의 채팅 응답도 함께 표시합니다.
                if (message.response) {
                    addMessage(message.response, 'ai');
                }
                break;
        }
    });

    function addMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        messageElement.textContent = text;
        messages.appendChild(messageElement);
        messages.scrollTop = messages.scrollHeight;
    }
}());
