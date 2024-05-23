use anyhow::{anyhow, Result};
use clap::Parser;
use dust::{
    data_sources::qdrant::{QdrantClients, QdrantCluster, SHARD_KEY_COUNT},
    providers::{
        embedder::{EmbedderProvidersModelMap, SupportedEmbedderModels},
        provider::{provider, ProviderID},
    },
    utils,
};
use qdrant_client::qdrant;
use tokio;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Name of the provider.
    #[arg(short, long)]
    provider: ProviderID,

    /// Name of the model.
    #[arg(short, long)]
    model: SupportedEmbedderModels,

    /// Name of the cluster.
    #[arg(short, long)]
    cluster: QdrantCluster,
}

async fn create_qdrant_collection(
    cluster: QdrantCluster,
    provider_id: ProviderID,
    model_id: SupportedEmbedderModels,
) -> Result<()> {
    let qdrant_clients = QdrantClients::build().await?;
    let client = qdrant_clients.client(cluster);
    let raw_client = client.raw_client();

    let embedder = provider(provider_id).embedder(model_id.to_string());

    let collection_name = format!(
        "{}_{}_{}",
        client.collection_prefix(),
        provider_id,
        model_id
    );

    println!(
        "About to create collection {} on cluster {}",
        collection_name, cluster
    );

    match utils::confirm(&format!(
        "Are you sure you want to create collection {} on cluster {}?",
        collection_name, cluster
    ))? {
        true => (),
        false => Err(anyhow!("Aborted"))?,
    }

    // See https://www.notion.so/dust-tt/Design-Doc-Qdrant-re-arch-d0ebdd6ae8244ff593cdf10f08988c27.

    // First, we create the collection.
    let res = raw_client
        .create_collection(&qdrant::CreateCollection {
            collection_name: collection_name.clone(),
            vectors_config: Some(qdrant::VectorsConfig {
                config: Some(qdrant::vectors_config::Config::Params(
                    qdrant::VectorParams {
                        size: embedder.embedding_size() as u64,
                        distance: qdrant::Distance::Cosine.into(),
                        on_disk: Some(true),
                        ..Default::default()
                    },
                )),
            }),
            hnsw_config: Some(qdrant::HnswConfigDiff {
                payload_m: Some(16),
                m: Some(0),
                ..Default::default()
            }),
            optimizers_config: Some(qdrant::OptimizersConfigDiff {
                memmap_threshold: Some(16384),
                ..Default::default()
            }),
            quantization_config: Some(qdrant::QuantizationConfig {
                quantization: Some(qdrant::quantization_config::Quantization::Scalar(
                    qdrant::ScalarQuantization {
                        r#type: qdrant::QuantizationType::Int8.into(),
                        quantile: Some(0.99),
                        always_ram: Some(true),
                    },
                )),
            }),
            on_disk_payload: Some(true),
            sharding_method: Some(qdrant::ShardingMethod::Custom.into()),
            shard_number: Some(2),
            replication_factor: Some(2),
            write_consistency_factor: Some(1),
            ..Default::default()
        })
        .await?;

    match res.result {
        true => {
            println!(
                "Done creating collection {} on cluster {}",
                collection_name, cluster
            );

            Ok(())
        }
        false => Err(anyhow!("Collection not created!")),
    }?;

    // Then, we create the 24 shard_keys.
    for i in 0..SHARD_KEY_COUNT {
        let shard_key = format!("{}_{}", client.shard_key_prefix(), i);

        let operation_result = raw_client
            .create_shard_key(
                collection_name.clone(),
                &qdrant::shard_key::Key::Keyword(shard_key.clone()),
                // No need to pass shard_key and replication_factor; using the ones specified during collection creation.
                None,
                None,
                &[],
            )
            .await?;

        match operation_result.result {
            true => {
                println!(
                    "Done creating shard key [{}] for collection {} on cluster {}",
                    shard_key, collection_name, cluster
                );

                Ok(())
            }
            false => Err(anyhow!("Collection not created!")),
        }?;
    }

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let args = Args::parse();

    // Validate the model for the given provider
    if !EmbedderProvidersModelMap::is_model_supported(&args.provider, &args.model) {
        eprintln!(
            "Error: Model {} is not available for provider {}.",
            args.model, args.provider
        );
        std::process::exit(1);
    }

    create_qdrant_collection(args.cluster, args.provider, args.model).await?;

    Ok(())
}
