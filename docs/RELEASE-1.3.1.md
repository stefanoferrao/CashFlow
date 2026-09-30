# Notas de Atualização — v1.3.1

Lançada em **30/09/2026**. Correção do "relogar toda hora": o bloqueio automático passou a reconhecer quando você está usando o app, as credenciais salvas ficam mais protegidas contra perda e "Bloquear agora" vale para todas as abas abertas.

## Novidades

### Bloquear agora vale para todas as abas
- Ao tocar em **Bloquear agora** numa aba ou janela, as outras abas com o CashFlow aberto também bloqueiam e pedem a senha local. Só o **sinal de bloqueio** passa entre elas: nenhuma chave, senha, credencial ou dado financeiro trafega entre as abas.
- O bloqueio **por inatividade não se espalha**: cada aba tem o próprio prazo, então uma aba esquecida não bloqueia a que você está usando.

### Armazenamento protegido contra descarte
- Ao desbloquear o app, ele pede ao navegador que trate os dados deste site como **armazenamento persistente**, para que o cofre e as credenciais cifradas não sejam descartados quando faltar espaço em disco.
- Em **Configurações** aparece se o armazenamento é persistente ou não. Quando não for, o aviso explica o risco.

## Correções

### Bloqueio automático que não atrapalha
- Antes, só clique, tecla, roda do mouse e toque contavam como uso. Agora também contam **movimento do mouse, rolagem, digitação e foco** na página.
- Ao voltar para a aba depois do prazo, o app bloqueia **na hora**, sem esperar o relógio do navegador (que atrasa em aba oculta). O tempo com a aba oculta conta como inatividade.
- Em **Configurações → Bloqueio automático**, o texto agora explica o que conta como uso e sugere **30 ou 60 minutos** para digitar a senha menos vezes. Também avisa que o Chrome ("Economia de memória") e o Edge ("Abas inativas") podem descartar abas em segundo plano e como evitar isso.

### Credenciais que "sumiam" ao reabrir
- Uma falha passageira ao abrir o banco de dados do navegador (IndexedDB), por exemplo com o arquivo do perfil momentaneamente travado por antivírus ou backup, fazia o app abrir como se as credenciais **não existissem** (tela de boas-vindas). Agora ele **tenta 3 vezes** e, se ainda não abrir, **avisa** que o armazenamento está indisponível. Nada é apagado: recarregar a página tenta de novo.
- Se você já tinha credenciais salvas e o **modo demonstração** foi a última tela usada, o app abria a demonstração e escondia o cofre. Agora, **existindo cofre neste navegador, abre a tela de bloqueio** (a demonstração continua disponível por ela).

### Trocar credenciais por valores errados
- Se a Pluggy **recusar** o Client ID ou o Client Secret novos, o app agora **restaura as credenciais anteriores** em vez de deixar as recusadas no lugar das boas. Se nunca houve credenciais, as recusadas são descartadas.
- Em erro que não é de credencial (sem internet, instabilidade da Pluggy), as novas ficam salvas, como antes.

### Aviso do modo "Usar somente nesta sessão"
- Nesse modo não há senha para desbloquear. O aviso de inatividade dizia que "seus dados continuam cifrados", o que não era verdade. Agora diz que a **sessão foi encerrada e as credenciais foram descartadas** porque só existiam na memória da aba.

## Privacidade e segurança
- **O modelo de segurança não mudou.** A chave de dados continua só na memória de cada aba e nunca é gravada. Por desenho, **recarregar, reabrir o app, abrir em outra aba ou janela ou o navegador descartar a aba** continua pedindo a senha local. A chave **não é compartilhada entre abas**.
- A restauração de credenciais usa uma cópia do registro **ainda cifrado**, feita antes da troca: nada é decifrado nem guardado em texto puro nesse processo.
- Nenhuma chamada de rede nova. O canal entre abas é local ao navegador (mesma origem) e só carrega o sinal de bloqueio.
- **Limitação conhecida:** se você usar **Trocar credenciais** em duas abas ao mesmo tempo e a Pluggy recusar as duas, as credenciais recusadas podem ficar salvas. Basta informá-las de novo em Configurações → Pluggy. Evite trocar credenciais em mais de uma aba ao mesmo tempo.

## Como atualizar
1. Publique a nova versão (o GitHub Pages faz o build automaticamente).
2. Abra o CashFlow e recarregue a página (ou toque em **Atualizar agora** no aviso de nova versão).
3. Seus dados e credenciais salvos **continuam os mesmos**: não há migração nem nova conexão. Digite a senha local quando o app pedir.
4. Para digitar a senha menos vezes, abra **Configurações → Bloqueio automático** e escolha **30 ou 60 minutos**.
