const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const morgan = require('morgan')
const client = new MongoClient('mongodb://localhost:27017', { useNewUrlParser: true });
let db;

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    if (!db) {
        client.connect(function (err) {
            db = client.db('changeParent');
            req.db = db.collection('data');
            next();
        });
    } else {
        req.db = db.collection('data');
        next();
    }
})
// Get all data
app.get('/', (req, res) => {
    req.db.find({}).toArray((err, data) => res.json(data))
})
// reset all data
app.post('/reset', async (req, res) => {
    await req.db.removeMany({})
    await req.db.insertOne(req.body, (err, results) => {
        req.db.createIndex({ '_id': 1 })
        req.db.createIndex({ 'toc.node_id': 1 })
        res.json(results)
    })

})

// level 1 - update
app.patch('/change/:node_id', async (req, res) => {
    try {
        // Retrieve TOC of desired document
        const results = await req.db.findOne({ '_id': 1 }, { 'toc': 1, '_id': 0 })
        const toc = results.toc;
        // targetted node
        let node;

        // remove targetted node from old branch
        const old_branch = toc
            .filter(element => {
                if (element.node_id === parseInt(req.params.node_id)) {
                    node = element;
                    return false;
                } else {
                    return element.parent === parseInt(req.body.old_parent)
                }
            }).map((element, i) => { // reorder old branch
                element.order = i + 1;
                return element;
            })
        // reorder new branch
        const new_branch = toc
            .filter(element => element.parent === parseInt(req.body.new_parent))
            .filter((element, i) => { // increase order of all nodes that are after new_order
                if (element.order >= parseInt(req.body.new_order)) i++;
                element.order = ++i;
                return element;

            })
        // update targetted node
        node.parent = parseInt(req.body.new_parent)
        node.order = parseInt(req.body.new_order)

        // add node to new branch
        new_branch.push(node)

        // sort new branch by order
        new_branch.sort((a, b) => a.order - b.order)

        // rest_nodes
        const rest_nodes = toc
            .filter(element => {
                return (element.parent !== parseInt(req.body.old_parent)) &&
                    (element.parent !== parseInt(req.body.new_parent))
            })

        // combine results and sort
        const output = [...rest_nodes, ...old_branch, ...new_branch]
            .sort((a, b) => a.parent - b.parent)



        // persist results in DB
        await req.db.updateOne(
            { '_id': 1 },
            { '$set': { 'toc': output } }
        )

        // res.json({ old_branch, new_branch, rest_nodes })
        // res.json({ output })

        req.db.find({}).toArray((err, data) => res.json(data))
    } catch (error) {
        res.json({ error })
    }
})



app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.json({
        message: err.message,
        error: {}
    });
});
app.listen(3000, () => console.log('listening to 3000'));