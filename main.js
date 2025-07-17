(function () {
    const vscode = acquireVsCodeApi();

    const messages = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

    function sendMessage() {
        const text = messageInput.value;
        if (text.trim() === '') return;

        addMessage(text, 'user');
        vscode.postMessage({
            command: 'sendMessage',
            text: text
        });

        messageInput.value = '';
    }

    window.addEventListener('message', event => {
        const message = event.data; 
        switch (message.command) {
            case 'addResponse':
                const text = message.text;
                const messageElement = document.createElement('div');
                messageElement.classList.add('message', 'ai');
                messageElement.innerHTML = marked.parse(text); // Use marked to parse markdown
                messages.appendChild(messageElement);
                messages.scrollTop = messages.scrollHeight;
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
