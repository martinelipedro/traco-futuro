# Atribuição dos dados

Este aplicativo utiliza desenhos e dados derivados do **Quick, Draw! Dataset**,
disponibilizado pelo Google sob a licença **Creative Commons Attribution 4.0**.

- Fonte: https://github.com/googlecreativelab/quickdraw-dataset
- Licença: https://creativecommons.org/licenses/by/4.0/

Os exemplos foram amostrados espacialmente e transformados em sequências de
deslocamentos e posições relativas. A biblioteca contém referências do conjunto
de treino; os exemplos de demonstração pertencem ao conjunto de teste.
Os pesos da GRU foram treinados neste projeto, sem uma API externa de IA.

A cabeça generativa utiliza uma mistura de gaussianas bivariadas, inspirada em
Ha e Eck, *A Neural Representation of Sketch Drawings* (2017):
https://arxiv.org/abs/1704.03477 . Esta implementação não reproduz o Sketch-RNN.

A continuação por referência adapta um desenho conhecido; a geração livre da GRU
é experimental. A acurácia apresentada mede reconhecimento, não qualidade das continuações.
