const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;
app.use('/Imagens', express.static('Imagens'));
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const multer = require('multer');
const path = require('path');

// Configuração do upload de imagens
const storage = multer.diskStorage({
  destination: './Imagens/itens/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Servir arquivos estáticos da pasta Imagens
app.use('/Imagens', express.static(path.join(__dirname, 'Imagens')));

// Servir todos os arquivos estáticos do diretório raiz, incluindo dashboard.html
app.use(express.static(__dirname));

// Configuração do banco de dados
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Abc123!@senai',
  database: 'meu_projeto'
});

connection.connect((err) => {
  if (err) {
    console.error('Erro ao conectar ao MySQL:', err);
    throw err;
  }
  console.log('Conectado ao MySQL!');
});

// Criar tabela de usuários se não existir
connection.query(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(50) NOT NULL,
    role ENUM('admin', 'user', 'developer') NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Erro ao criar tabela usuarios:', err);
    throw err;
  }
  connection.query("SELECT COUNT(*) as count FROM usuarios", (err, result) => {
    if (err) {
      console.error('Erro ao contar usuários:', err);
      throw err;
    }
    if (result[0].count === 0) {
      connection.query(`
        INSERT INTO usuarios (email, password, role) VALUES 
        ('admin@senairs.org.br', '1234', 'admin'),
        ('lucas.pacheco@senairs.org.br', 'lucas.2001', 'admin'),
        ('marcildo.camini@senairs.org.br', '1234', 'user'),
        ('dev@senairs.org.br', '1234', 'developer')
      `, (err) => {
        if (err) console.error('Erro ao inserir usuários iniciais:', err);
      });
    }
  });
});

// Criar tabela de itens se não existir
connection.query(`
  CREATE TABLE IF NOT EXISTS itens_almoxarifado (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    setor VARCHAR(100) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    complemento VARCHAR(255) NOT NULL,
    unidade ENUM('UN', 'KG') NOT NULL,
    qtd_inicial INT NOT NULL DEFAULT 0,
    qtd_minima INT DEFAULT 0,
    imagem_path VARCHAR(255),
    observacao TEXT,
    fornecedor VARCHAR(100),
    nota_fiscal VARCHAR(100),
    created_by VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Erro ao criar tabela itens_almoxarifado:', err);
    throw err;
  }
  console.log('Tabela itens_almoxarifado criada ou já existente.');
});

// Criar tabela de movimentações se não existir
connection.query(`
  CREATE TABLE IF NOT EXISTS movimentacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT,
    tipo ENUM('ENTRADA', 'SAÍDA') NOT NULL,
    quantidade INT NOT NULL,
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    observacao VARCHAR(255),
    nota_fiscal VARCHAR(50),
    usuario VARCHAR(100) NOT NULL,
    FOREIGN KEY (item_id) REFERENCES itens_almoxarifado(id)
  )
`, (err) => {
  if (err) {
    console.error('Erro ao criar tabela movimentacoes:', err);
    throw err;
  }
  console.log('Tabela movimentacoes criada ou já existente.');
});

// Rota de login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  connection.query(
    'SELECT * FROM usuarios WHERE email = ? AND password = ?',
    [email, password],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length > 0) {
        res.json({ success: true, role: results[0].role, email: results[0].email });
      } else {
        res.status(401).json({ success: false, message: 'Usuário ou senha inválidos' });
      }
    }
  );
});

// Rota para cadastrar usuário (só admins)
app.post('/api/register', (req, res) => {
  const { email, password, role, requesterEmail } = req.body;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem cadastrar usuários' });
      }

      connection.query(
        'INSERT INTO usuarios (email, password, role) VALUES (?, ?, ?)',
        [email, password, role],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, message: 'Usuário cadastrado com sucesso' });
        }
      );
    }
  );
});

// Rota para listar usuários (só admins)
app.get('/api/users', (req, res) => {
  const { requesterEmail } = req.query;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) {
        console.error('Erro ao verificar role:', err);
        return res.status(500).json({ error: err.message });
      }
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem listar usuários' });
      }

      connection.query(
        'SELECT id, email, role FROM usuarios WHERE email != ?',
        [requesterEmail],
        (err, results) => {
          if (err) {
            console.error('Erro ao listar usuários:', err);
            return res.status(500).json({ error: err.message });
          }
          res.json({ success: true, users: results });
        }
      );
    }
  );
});

// Rota para excluir usuário (só admins)
app.post('/api/delete-user', (req, res) => {
  const { userEmail, requesterEmail } = req.body;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem excluir usuários' });
      }

      if (userEmail === requesterEmail) {
        return res.status(400).json({ success: false, message: 'Você não pode excluir a si mesmo' });
      }

      connection.query(
        'DELETE FROM usuarios WHERE email = ?',
        [userEmail],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, message: 'Usuário excluído com sucesso' });
        }
      );
    }
  );
});

// Rota para listar itens
app.get('/api/itens', (req, res) => {
  connection.query('SELECT * FROM itens_almoxarifado', (err, results) => {
    if (err) {
      console.error('Erro ao listar itens:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// Rota para adicionar item (só admins)
app.post('/api/add-item', upload.single('imagem'), (req, res) => {
  const { codigo, setor, nome, complemento, unidade, qtdInicial, qtdMinima, observacao, fornecedor, notaFiscal, requesterEmail } = req.body;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem cadastrar itens' });
      }

      connection.query('SELECT id FROM itens_almoxarifado WHERE codigo = ?', [codigo], (err, dupResults) => {
        if (err) return res.status(500).json({ error: err.message });
        if (dupResults.length > 0) {
          return res.status(400).json({ success: false, message: 'Código já existe. Use um código único.' });
        }

        const imagemPath = req.file ? `Imagens/itens/${req.file.filename}` : null;
        connection.query(
          'INSERT INTO itens_almoxarifado (codigo, setor, nome, complemento, unidade, qtd_inicial, qtd_minima, imagem_path, observacao, fornecedor, nota_fiscal, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [codigo, setor, nome, complemento, unidade, qtdInicial, qtdMinima || 0, imagemPath, observacao || null, fornecedor || null, notaFiscal || null, requesterEmail],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Item cadastrado com sucesso' });
          }
        );
      });
    }
  );
});

// Rota para adicionar estoque (só admins)
app.post('/api/add-stock', (req, res) => {
  const { itemId, quantity, requesterEmail } = req.body;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem adicionar estoque' });
      }

      connection.query(
        'SELECT qtd_inicial FROM itens_almoxarifado WHERE id = ?',
        [itemId],
        (err, results) => {
          if (err) return res.status(500).json({ error: err.message });
          if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Item não encontrado' });
          }

          const currentQuantity = results[0].qtd_inicial;
          const newQuantity = currentQuantity + parseInt(quantity, 10);

          connection.query(
            'UPDATE itens_almoxarifado SET qtd_inicial = ? WHERE id = ?',
            [newQuantity, itemId],
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
              // Registrar movimentação
              connection.query(
                'INSERT INTO movimentacoes (item_id, tipo, quantidade, usuario) VALUES (?, ?, ?, ?)',
                [itemId, 'ENTRADA', quantity, requesterEmail],
                (err) => {
                  if (err) console.error('Erro ao registrar movimentação de entrada:', err);
                }
              );
              res.json({ success: true, message: 'Estoque atualizado com sucesso', newQuantity });
            }
          );
        }
      );
    }
  );
});

// Rota para remover estoque (só admins)
app.post('/api/remove-stock', (req, res) => {
  const { itemId, quantity, requesterEmail } = req.body;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem remover estoque' });
      }

      connection.query(
        'SELECT qtd_inicial FROM itens_almoxarifado WHERE id = ?',
        [itemId],
        (err, results) => {
          if (err) return res.status(500).json({ error: err.message });
          if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Item não encontrado' });
          }

          const currentQuantity = results[0].qtd_inicial;
          const requestedQuantity = parseInt(quantity, 10);
          if (requestedQuantity > currentQuantity) {
            return res.status(400).json({ success: false, message: 'Quantidade a remover excede o estoque atual' });
          }

          const newQuantity = currentQuantity - requestedQuantity;

          connection.query(
            'UPDATE itens_almoxarifado SET qtd_inicial = ? WHERE id = ?',
            [newQuantity, itemId],
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
              // Registrar movimentação
              connection.query(
                'INSERT INTO movimentacoes (item_id, tipo, quantidade, usuario) VALUES (?, ?, ?, ?)',
                [itemId, 'SAÍDA', quantity, requesterEmail],
                (err) => {
                  if (err) console.error('Erro ao registrar movimentação de saída:', err);
                }
              );
              res.json({ success: true, message: 'Estoque removido com sucesso', newQuantity });
            }
          );
        }
      );
    }
  );
});

// Rota para obter e atualizar item (só admins)
app.post('/api/update-item', upload.single('imagem'), (req, res) => {
  const { id, codigo, setor, nome, complemento, unidade, qtdInicial, qtdMinima, observacao, fornecedor, notaFiscal, requesterEmail } = req.body;
  const imagemPath = req.file ? `Imagens/itens/${req.file.filename}` : null;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem editar itens' });
      }

      connection.query(
        'SELECT * FROM itens_almoxarifado WHERE id = ?',
        [id],
        (err, results) => {
          if (err) return res.status(500).json({ error: err.message });
          if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Item não encontrado' });
          }

          if (results[0].codigo !== codigo) {
            connection.query(
              'SELECT id FROM itens_almoxarifado WHERE codigo = ? AND id != ?',
              [codigo, id],
              (err, dupResults) => {
                if (err) return res.status(500).json({ error: err.message });
                if (dupResults.length > 0) {
                  return res.status(400).json({ success: false, message: 'Código já existe. Use um código único.' });
                }
              }
            );
          }

          connection.query(
            'UPDATE itens_almoxarifado SET codigo = ?, setor = ?, nome = ?, complemento = ?, unidade = ?, qtd_inicial = ?, qtd_minima = ?, imagem_path = ?, observacao = ?, fornecedor = ?, nota_fiscal = ? WHERE id = ?',
            [codigo, setor, nome, complemento, unidade, qtdInicial, qtdMinima || 0, imagemPath || results[0].imagem_path, observacao || null, fornecedor || null, notaFiscal || null, id],
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
              res.json({ success: true, message: 'Item atualizado com sucesso' });
            }
          );
        }
      );
    }
  );
});

// Nova rota para atualizar a role do usuário (só admins)
app.post('/api/update-user-role', (req, res) => {
  const { email, newRole, requesterEmail } = req.body;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem editar roles' });
      }

      if (email === requesterEmail) {
        return res.status(400).json({ success: false, message: 'Você não pode alterar a sua própria role' });
      }

      connection.query(
        'UPDATE usuarios SET role = ? WHERE email = ?',
        [newRole, email],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, message: 'Role do usuário atualizada com sucesso' });
        }
      );
    }
  );
});

// Rota para excluir item (só admins)
app.post('/api/delete-item', (req, res) => {
  const { itemId, requesterEmail } = req.body;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem excluir itens' });
      }

      connection.query(
        'DELETE FROM itens_almoxarifado WHERE id = ?',
        [itemId],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, message: 'Item excluído com sucesso' });
        }
      );
    }
  );
});

// Nova rota para listar movimentações
app.get('/api/movimentacoes', (req, res) => {
  connection.query(
    'SELECT m.*, i.codigo, i.nome FROM movimentacoes m LEFT JOIN itens_almoxarifado i ON m.item_id = i.id ORDER BY m.data DESC',
    (err, results) => {
      if (err) {
        console.error('Erro ao listar movimentações:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(results.map(row => ({
        id: row.id,
        item_id: row.item_id,
        tipo: row.tipo,
        quantidade: row.quantidade,
        data: row.data.toISOString().split('T')[0] + ', ' + row.data.toTimeString().split(' ')[0],
        observacao: row.observacao,
        nota_fiscal: row.nota_fiscal,
        usuario: row.usuario,
        codigo: row.codigo,
        nome: row.nome
      })));
    }
  );
});

// Função para obter IP local (usada na mensagem do servidor)
function getLocalIp() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (let iface of Object.values(interfaces)) {
    for (let alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}

// Iniciar servidor
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://0.0.0.0:${port} (acessível na rede local via ${getLocalIp()})`);
});