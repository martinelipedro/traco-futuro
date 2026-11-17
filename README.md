# Traço Futuro

Reconhecimento progressivo e continuação de desenhos com GRU, usando dados do
Quick, Draw!. O aplicativo executa a inferência no navegador, sem backend Python
ou API de IA. Pesos, exemplos e relatório PDF já acompanham `dist/`.

## Usar

- Desenhe ou escolha um exemplo e revele os traços aos poucos.
- Acompanhe as hipóteses e as curvas de probabilidade.
- Escolha uma categoria e peça uma continuação.
- Compare com o original e experimente outras possibilidades.

O recorte contém gato, peixe, flor, casa, árvore e guarda-chuva.

## Resultados e limitações

A acurácia média entre duas seeds é **89,4% com desenhos completos** e **82,8% com
metade dos eventos**, em 1.500 desenhos de teste. O aplicativo usa a seed 42.
Esses números medem reconhecimento; não medem a qualidade de completar desenhos.

- **Com referência do treino:** adapta a continuação de um exemplo conhecido.
  Pode encaixar mal ou escolher uma forma diferente da intenção do usuário.
- **Geração livre da GRU:** amostra novos deslocamentos e estados da caneta.
  É experimental e ainda produz figuras deformadas com frequência.

O relatório completo está em [dist/relatorio.pdf](dist/relatorio.pdf).
Os desenhos feitos na interface não são enviados ao servidor.

## Abrir localmente

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Abra http://127.0.0.1:8765. Use HTTP; abrir `index.html` diretamente pode bloquear
os módulos JavaScript e o carregamento dos pesos.

## Verificar

Requer Node.js 20 ou mais recente. Não há dependências npm para instalar.

```bash
node scripts/check-site.mjs
```

A verificação confere recursos relativos, pesos, biblioteca, PDF e uma inferência
real. O site funciona também sob o prefixo `/traco-futuro/` do Pages de projeto.

## Publicar no GitHub Pages

Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
Faça push em `main` ou execute manualmente **Actions → Publicar Traço Futuro → Run workflow**.
O workflow verifica o aplicativo e publica somente `dist/`, incluindo o PDF.
Ele não treina modelos, não instala pacotes npm e não usa secrets personalizados.
A publicação usa as permissões padrão `pages: write` e `id-token: write`.

Este repositório contém o aplicativo e os artefatos exportados. O protocolo de
preparação e treinamento está descrito no relatório. As referências são do treino,
e os exemplos de demonstração são do teste.

## Dados

Google Quick, Draw!, licença CC BY 4.0. Veja [DATA_ATTRIBUTION.md](DATA_ATTRIBUTION.md).
A implementação não reproduz o Sketch-RNN.
