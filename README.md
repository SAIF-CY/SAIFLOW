# Saiflow 🧠 — Grafos & Fluxogramas Interativos

Saiflow é uma aplicação web interativa que combina elementos de grafos e fluxogramas, permitindo a criação de mapas mentais visuais, dinâmicos e altamente customizáveis. Ideal para brainstorming, estruturação de fluxos e organização de ideias.

---

## 🚀 Funcionalidades Principais

- **Workspace Infinito e Canvas Flexível:** Crie, arraste e posicione caixas geométricas livremente em uma grade infinita com suporte a zoom (através de scroll ou controles) e translação.
- **Formas e Proporções Personalizáveis:** Adicione caixas em formato de retângulos, caixas com bordas arredondadas, círculos (elipses) e diamantes. Ajuste individualmente a cor, largura e altura de cada caixa.
- **Painel de Anotações Expansível:** Dê um duplo-clique em qualquer caixa para abrir um modal elegante de anotações. A tela de fundo é escurecida de forma suave e as anotações podem ser lidas ou editadas no próprio modal.
- **Menu de Contexto Completo:** Clique com o botão direito sobre qualquer caixa para acessar opções rápidas:
  - ✏️ **Renomear:** Edição em linha do nome diretamente no nó.
  - 📝 **Editar Anotação:** Atalho para abrir e editar a descrição.
  - 🎨 **Mudar Cor:** Janela nativa de escolha de cor com atualização em tempo real.
  - 🗑️ **Excluir:** Remove a caixa e todas as conexões vinculadas a ela.
- **Fios de Conexão Inteligentes:**
  - **Alinhamento Perfeito:** Os fios tocam exatamente os limites/bordas de cada forma, incluindo círculos deformados (elipses) e diamantes rotacionados.
  - **Cores Dependentes e Degradês:** A cor da linha é baseada na caixa de origem. Se as caixas conectadas tiverem cores diferentes, é gerado um degradê dinâmico e suave na seção central do fio (entre 30% e 70%).
  - **Cancelamento Rápido:** Ao arrastar uma nova conexão, clicar em qualquer parte do fundo (canvas) cancela a operação e remove a linha temporária.
- **Personalização de Temas:** Alterne entre os modos **Escuro 🌙**, **Claro ☀️** e **Tarde 🌅** com transições suaves e adaptativas para as conexões.
- **Importação/Exportação:** Salve seus mapas mentais localmente em arquivos `.saiflow` (formato JSON) e restaure-os quando desejar.

---

## ⌨️ Atalhos e Interações

- **Duplo-clique no fundo:** Cria uma nova caixa na posição do cursor.
- **Duplo-clique em uma caixa:** Abre a visualização de anotações (Modal).
- **Arrastar com o botão esquerdo (no fundo):** Navega (translada) pelo painel infinito.
- **Rodar a roda do mouse (Scroll):** Realiza zoom em direção ao cursor do mouse.
- **Botão direito em uma caixa:** Abre o menu de contexto.
- **Tecla `Escape` (ESC):** Fecha modais abertos, cancela o menu de contexto ou cancela os modos de conexão/exclusão.
- **Tecla `Delete` / `Backspace`:** Exclui a caixa selecionada (fora de campos de digitação).

---

## 🛠️ Detalhes de Implementação

### 1. Sistema de Coordenadas e Zoom
O canvas é gerenciado por uma matriz de transformação CSS (`transform: translate(x, y) scale(z)`). As conversões entre a tela física do navegador (viewport) e as coordenadas lógicas do canvas utilizam a seguinte fórmula matemática:
$$\text{CanvasX} = \frac{\text{ClientX} - \text{ViewportLeft} - \text{CanvasOffsetX}}{\text{Zoom}}$$
$$\text{CanvasY} = \frac{\text{ClientY} - \text{ViewportTop} - \text{CanvasOffsetY}}{\text{Zoom}}$$

### 2. Cálculo Exato de Bordas (Portas de Conexão)
Para que os fios toquem as bordas das formas de maneira limpa:
- **Retângulos, Caixas Arredondadas e Círculos/Elipses:** As portas (superior, direita, inferior e esquerda) são mapeadas para os pontos médios das quatro extremidades de seu retângulo envolvente.
- **Diamantes (Rotacionados 45°):** Os pontos médios originais são rotacionados matematicamente em $\pi/4$ radianos em relação ao centro do nó $(cx, cy)$:
  $$x_{\text{rot}} = cx + (x - cx)\cos(\theta) - (y - cy)\sin(\theta)$$
  $$y_{\text{rot}} = cy + (x - cx)\sin(\theta) + (y - cy)\cos(\theta)$$
  Isso garante que o início e o fim da curva Bezier encontrem os vértices visuais do diamante com exatidão.

### 3. Gradientes Dinâmicos no SVG
Quando duas caixas com cores diferentes são conectadas, a aplicação insere dinamicamente uma tag `<linearGradient>` com `gradientUnits="userSpaceOnUse"` baseada nas coordenadas absolutas das portas de início e fim da conexão. Isso faz com que o degradê flua exatamente na direção da reta de conexão.

---

## ⚙️ Tecnologias Utilizadas

- **Estruturação:** HTML5 Semântico
- **Lógica de Aplicação:** Vanilla Javascript (ES6)
- **Estilização e Layout:** CSS3 Moderno (Variáveis HSL, Flexbox, Keyframes, Animações e Backdrop-filters)
- **Renderização Gráfica:** SVG nativo (Scalable Vector Graphics) para conexões e curvas Bezier

---

## 💾 Persistência e Migração de Dados
A aplicação salva o progresso automaticamente no `localStorage` sob a chave `saiflow_data`. 
Caso você possua dados antigos criados na versão anterior (MindFlow), a aplicação detectará a chave antiga `mindflow_data` automaticamente no primeiro carregamento e migrará suas caixas e conexões sem perda de dados.
